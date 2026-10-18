import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speaker } from "./audio.ts";

const gain = { value:1, cancelScheduledValues:vi.fn(), setValueAtTime:vi.fn(), linearRampToValueAtTime:vi.fn() };
let sources: { start:ReturnType<typeof vi.fn>; stop:ReturnType<typeof vi.fn>; connect:ReturnType<typeof vi.fn> }[];
class Context {
  currentTime = 10;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createGain() { return { gain, connect:vi.fn() }; }
  createBuffer(_channels:number, length:number, rate:number) { return { getChannelData:() => new Float32Array(length), duration:length / rate }; }
  createBufferSource() { const source = { start:vi.fn(), stop:vi.fn(), connect:vi.fn() }; sources.push(source); return source; }
}
beforeEach(() => { sources = []; vi.clearAllMocks(); vi.stubGlobal("AudioContext", Context); });
afterEach(() => vi.unstubAllGlobals());
const pcm = btoa("\0\0\0\0");
describe("spoken playback", () => {
  it("plays by default and fades all queued audio when muted mid-reply", () => {
    const speaker = new Speaker();
    speaker.play(pcm); speaker.play(pcm);
    expect(sources).toHaveLength(2);
    speaker.setMuted(true);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.12);
    for (const source of sources) expect(source.stop).toHaveBeenCalledWith(10.12);
    speaker.play(pcm);
    expect(sources).toHaveLength(2);
  });
  it("discards muted chunks and waits for the next turn when re-enabled mid-sentence", () => {
    const speaker = new Speaker();
    speaker.setMuted(true); speaker.play(pcm);
    speaker.setMuted(false); speaker.play(pcm);
    expect(sources).toHaveLength(0);
    speaker.turnEnded(); speaker.play(pcm);
    expect(sources).toHaveLength(1);
  });
  it("can re-enable while idle without losing the next reply", () => {
    const speaker = new Speaker();
    speaker.setMuted(true); speaker.turnEnded(); speaker.setMuted(false); speaker.play(pcm);
    expect(sources).toHaveLength(1);
    speaker.interrupt();
    expect(sources[0].stop).toHaveBeenCalled();
  });
  it("keeps held Teach audio muted through the same playback gate", () => {
    const speaker = new Speaker();
    speaker.beginTurn(); speaker.setMuted(true);
    [pcm, pcm].forEach((chunk) => speaker.play(chunk));
    speaker.turnEnded();
    expect(sources).toHaveLength(0);
  });
});
