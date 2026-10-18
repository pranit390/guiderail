import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({
  callbacks: undefined as undefined | { onmessage: (msg: object) => void },
  session: { close: vi.fn(), sendRealtimeInput: vi.fn(), sendClientContent: vi.fn(), sendToolResponse: vi.fn() },
}));
vi.mock("@google/genai", async (original) => ({
  ...(await original<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    live = { connect: async (options: { callbacks: typeof live.callbacks }) => { live.callbacks = options.callbacks; return live.session; } };
  },
}));
vi.mock("./playbooks/load.ts", () => ({ loadPlaybooks: async () => [], loadRuleLines: async () => [] }));

const { IDLE_MS, relay } = await import("./live.ts");

/** A client that never answers close frames, so only the relay can stop the Live session. */
class Client extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  sent: { type: string; message?: string }[] = [];
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close = vi.fn(() => { this.readyState = 2; });
  input(msg: object) { this.emit("message", Buffer.from(JSON.stringify(msg))); }
}

async function start() {
  const client = new Client();
  const release = vi.fn();
  const end = relay(client as unknown as WebSocket, undefined, "guide", undefined, release);
  for (let i = 0; i < 20 && !client.sent.length; i++) await Promise.resolve();
  expect(client.sent).toEqual([{ type: "ready" }]);
  return { client, end, release };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  Object.values(live.session).forEach((fn) => fn.mockClear());
});
afterEach(() => vi.useRealTimers());

describe("Live idle timeout", () => {
  it("closes the Live session after a minute without user input or model output", async () => {
    const { client } = await start();
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(live.session.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "idle");
    expect(client.sent.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("without activity") });
  });

  it.each([
    { type: "text", text: "where are labels?" },
    { type: "audio_end" },
    { type: "event", text: "User clicked the highlighted Labels" },
    { type: "context", text: "Expert clicked Next" },
    { type: "app", text: "Playbook draft ready" },
  ])("restarts the minute on %j", async (msg) => {
    const { client } = await start();
    vi.advanceTimersByTime(IDLE_MS - 1);
    client.input(msg);
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(live.session.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(live.session.close).toHaveBeenCalledOnce();
  });

  it("restarts the minute on model output and transcribed speech", async () => {
    await start();
    vi.advanceTimersByTime(IDLE_MS - 1);
    live.callbacks!.onmessage({ serverContent: { inputTranscription: { text: "where are labels" } } });
    vi.advanceTimersByTime(IDLE_MS - 1);
    live.callbacks!.onmessage({ serverContent: { outputTranscription: { text: "Open Labels." } } });
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(live.session.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(live.session.close).toHaveBeenCalledOnce();
  });

  it("times out an open microphone that only sends silent frames", async () => {
    const { client } = await start();
    for (let t = 0; t < IDLE_MS; t += 100) {
      client.input({ type: "audio", data: "AAAA" });
      vi.advanceTimersByTime(100);
    }
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "idle");
  });

  it("does not restart the minute for session summaries, tool results, unknown messages or resumption updates", async () => {
    const { client } = await start();
    vi.advanceTimersByTime(IDLE_MS / 2);
    client.input({ type: "session", text: "Session so far" });
    client.input({ type: "tool_result", id: "1", name: "read_page", response: {} });
    client.input({ type: "keepalive", text: "x" });
    live.callbacks!.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: "h" } });
    vi.advanceTimersByTime(IDLE_MS / 2);
    expect(live.session.close).toHaveBeenCalledOnce();
  });
});

describe("Live limits", () => {
  it("closes the Live session immediately when the admission allowance ends", async () => {
    const { client, end, release } = await start();
    end("demo allowance reached", "This demo session reached its daily voice limit.");
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "demo allowance reached");
    expect(client.sent.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("daily voice limit") });
    client.emit("close");
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the slot when the idle limit stops Live, before the client answers the close", async () => {
    const { release } = await start();
    vi.advanceTimersByTime(IDLE_MS);
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("closes Live and releases the slot when the client disconnects", async () => {
    const { client, release } = await start();
    client.emit("close");
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("closes the Live session immediately at the eighth reply", async () => {
    const { client } = await start();
    for (let i = 0; i < 7; i++) live.callbacks!.onmessage({ serverContent: { turnComplete: true } });
    expect(live.session.close).not.toHaveBeenCalled();
    live.callbacks!.onmessage({ serverContent: { turnComplete: true } });
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "reply allowance reached");
  });

  it("closes the Live session immediately when input exceeds the allowance", async () => {
    const { client } = await start();
    for (let i = 0; i < 7; i++) client.input({ type: "text", text: "x".repeat(4000) });
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "input allowance reached");
    expect(live.session.sendClientContent).toHaveBeenCalledTimes(6);
  });
});
