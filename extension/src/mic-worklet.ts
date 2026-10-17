// Collects mic samples (the AudioContext already runs at 16 kHz) and posts ~100 ms PCM16 chunks.
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { port: MessagePort; }

class MicProcessor extends AudioWorkletProcessor {
  private buf = new Int16Array(sampleRate / 10);
  private n = 0;
  process(inputs: Float32Array[][]) {
    const ch = inputs[0]?.[0];
    if (ch) {
      for (const x of ch) {
        this.buf[this.n++] = Math.max(-1, Math.min(1, x)) * 0x7fff;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.buffer.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("mic", MicProcessor);
