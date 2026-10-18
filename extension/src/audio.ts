// Mic capture (16 kHz PCM16 out) and speech playback (24 kHz PCM16 in).

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export class Mic {
  private ctx?: AudioContext;
  private stream?: MediaStream;

  async start(onChunk: (base64: string) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule(chrome.runtime.getURL("mic-worklet.js"));
    const node = new AudioWorkletNode(this.ctx, "mic");
    node.port.onmessage = (e) => onChunk(toBase64(e.data));
    this.ctx.createMediaStreamSource(this.stream).connect(node);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = undefined;
  }
}

export class Speaker {
  private ctx = new AudioContext({ sampleRate: 24000 });
  private gain = this.ctx.createGain();
  private muted = false;
  private armed = false;
  private inTurn = false;
  private silentUntil = 0;
  private at = 0;

  constructor() { this.gain.connect(this.ctx.destination); }

  beginTurn() { this.inTurn = true; }
  turnEnded() { this.inTurn = false; this.armed = false; }

  setMuted(muted: boolean) {
    if (muted === this.muted) return;
    this.muted = muted;
    if (!muted) { this.armed = this.inTurn; return; }
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + 0.12);
    this.silentUntil = now + 0.12;
    for (const source of this.playing) source.stop(this.silentUntil);
    this.playing.clear();
    this.at = 0;
  }
  private playing = new Set<AudioBufferSourceNode>();

  play(base64: string) {
    this.beginTurn();
    if (this.muted || this.armed) return;
    void this.ctx.resume();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const buf = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    this.at = Math.max(this.at, this.ctx.currentTime + 0.05, this.silentUntil);
    this.gain.gain.setValueAtTime(1, this.at);
    src.start(this.at);
    this.at += buf.duration;
    this.playing.add(src);
    src.onended = () => this.playing.delete(src);
  }

  // The user started talking over the model: stop at once.
  interrupt() {
    for (const s of this.playing) s.stop();
    this.playing.clear();
    this.at = 0;
  }
}
