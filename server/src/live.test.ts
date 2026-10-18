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
  it("shuts down only this session and releases once on socket errors", async () => {
    const { client, release } = await start();
    client.emit("error", new RangeError("Max payload size exceeded"));
    client.emit("close");
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
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

describe("tool result input boundary", () => {
  const call = (id: string, name = "read_page") => live.callbacks!.onmessage({ toolCall: { functionCalls: [{ id, name, args: {} }] } });

  it("forwards only a matching outstanding tool result, once", async () => {
    const { client } = await start();
    for (let i = 0; i < 10; i++) client.input({ type: "tool_result", id: `not-issued-${i}`, name: "read_page", response: { text: "x".repeat(50_000) } });
    call("issued");
    client.input({ type: "tool_result", id: "issued", name: "read_form", response: {} });
    expect(live.session.sendToolResponse).not.toHaveBeenCalled();
    const result = { type: "tool_result", id: "issued", name: "read_page", response: { title: "Create service" } };
    client.input(result);
    client.input(result);
    expect(live.session.sendToolResponse).toHaveBeenCalledExactlyOnceWith({ functionResponses: [{ id: "issued", name: "read_page", response: result.response }] });
  });

  it("ends the session before forwarding an oversized issued result", async () => {
    const { client, release } = await start();
    call("issued");
    client.input({ type: "tool_result", id: "issued", name: "read_page", response: { text: "x".repeat(50_000) } });
    expect(live.session.sendToolResponse).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledWith(4000, "input allowance reached");
    expect(release).toHaveBeenCalledOnce();
  });

  it("charges serialized response, id and name to the same 24,000-character budget as text", async () => {
    const { client } = await start();
    const response = { text: "x".repeat(3970) };
    for (let i = 0; i < 6; i++) {
      call(String(i));
      client.input({ type: "tool_result", id: String(i), name: "read_page", response });
    }
    const used = 6 * (1 + "read_page".length + JSON.stringify(response).length);
    client.input({ type: "text", text: "x".repeat(24_000 - used) });
    call("last");
    client.input({ type: "tool_result", id: "last", name: "read_page", response: {} });
    expect(live.session.sendToolResponse).toHaveBeenCalledTimes(6);
    expect(client.close).toHaveBeenCalledWith(4000, "input allowance reached");
  });
});
