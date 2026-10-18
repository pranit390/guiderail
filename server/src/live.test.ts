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
  const end = relay(client as unknown as WebSocket);
  for (let i = 0; i < 20 && !client.sent.length; i++) await Promise.resolve();
  expect(client.sent).toEqual([{ type: "ready" }]);
  return { client, end };
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

  it("restarts the minute on typed or spoken input and on model output", async () => {
    const { client } = await start();
    vi.advanceTimersByTime(IDLE_MS - 1);
    client.input({ type: "text", text: "where are labels?" });
    vi.advanceTimersByTime(IDLE_MS - 1);
    client.input({ type: "audio", data: "AAAA" });
    vi.advanceTimersByTime(IDLE_MS - 1);
    live.callbacks!.onmessage({ serverContent: { outputTranscription: { text: "Open Labels." } } });
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(live.session.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(live.session.close).toHaveBeenCalledOnce();
  });

  it("does not restart the minute for page context, app events or resumption updates", async () => {
    const { client } = await start();
    vi.advanceTimersByTime(IDLE_MS / 2);
    client.input({ type: "context", text: "clicked Next" });
    client.input({ type: "app", text: "draft ready" });
    live.callbacks!.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: "h" } });
    vi.advanceTimersByTime(IDLE_MS / 2);
    expect(live.session.close).toHaveBeenCalledOnce();
  });
});

describe("Live limits", () => {
  it("closes the Live session immediately when the admission allowance ends", async () => {
    const { client, end } = await start();
    end("demo allowance reached", "This demo session reached its daily voice limit.");
    expect(live.session.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledWith(4000, "demo allowance reached");
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
