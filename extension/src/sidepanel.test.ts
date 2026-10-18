// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mic = vi.hoisted(() => ({ onChunk: undefined as ((data: string) => void) | undefined }));
vi.mock("./audio.ts", () => ({
  Mic: class { async start(onChunk: (data: string) => void) { mic.onChunk = onChunk; } stop() {} },
  Speaker: class { play() {} interrupt() {} },
}));
vi.mock("./config.ts", () => ({ HTTP: "https://coach.example", SERVER: "wss://coach.example", SERVER_HOST: "coach.example" }));

class Socket {
  static OPEN = 1;
  readyState = Socket.OPEN;
  onmessage: ((event: { data: string }) => void) | undefined;
  onclose: (() => void) | undefined;
  onerror: (() => void) | undefined;
  send = vi.fn();
  close = vi.fn();
  constructor(readonly url: string) { sockets.push(this); }
  receive(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}
let sockets: Socket[];
const sendMessage = vi.fn().mockResolvedValue({ ok: true });
const fetchMock = vi.fn(async (url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> => url.endsWith("/session")
  ? { ok: true, json: async () => ({ credential: "one-use" }) }
  : { ok: true, json: async () => ({ rules: [] }) });
const sessionRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/session")).length;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const status = () => $("#status").textContent;
const sent = (socket: Socket) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));

function type(text: string) {
  $<HTMLInputElement>("#text").value = text;
  $<HTMLFormElement>("#form").dispatchEvent(new Event("submit", { cancelable: true }));
}

async function connected() {
  type("hello");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  sockets[0].receive({ type: "ready" });
  sockets[0].send.mockClear();
  return sockets[0];
}

beforeEach(async () => {
  vi.resetModules();
  sockets = [];
  mic.onChunk = undefined;
  sendMessage.mockClear();
  fetchMock.mockClear();
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() }, getURL: (path: string) => path },
    storage: { session: { set: vi.fn(), remove: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), sendMessage, create: vi.fn() },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://coach.example/rules"));
});

afterEach(() => vi.unstubAllGlobals());

describe("lazy Live connection", () => {
  it("does not request a session or open a socket when the panel opens", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sessionRequests()).toBe(0);
    expect(sockets).toHaveLength(0);
    expect(status()).toBe("Type or press Talk to connect to coach.example");
  });

  it("connects on the first typed message and delivers it once the relay is ready", async () => {
    type("where are labels?");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(sessionRequests()).toBe(1);
    expect(sockets[0].url).toContain("credential=one-use");
    expect(sockets[0].send).not.toHaveBeenCalled();
    sockets[0].receive({ type: "ready" });
    expect(status()).toBe("Connected to coach.example");
    expect(sent(sockets[0])).toEqual([{ type: "text", text: "where are labels?" }]);
  });

  it("connects on Talk and delivers the first speech once the relay is ready", async () => {
    $<HTMLButtonElement>("#talk").click();
    await vi.waitFor(() => expect(mic.onChunk).toBeDefined());
    mic.onChunk!("AAAA");
    mic.onChunk!("BBBB");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(sessionRequests()).toBe(1);
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0])).toEqual([{ type: "audio", data: "AAAA" }, { type: "audio", data: "BBBB" }]);
  });

  it("switches between Teach and Guide without connecting", async () => {
    const socket = await connected();
    $<HTMLButtonElement>("#teach").click();
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toHaveLength(1);
    expect(sessionRequests()).toBe(1);
    expect(status()).toBe("Type or press Talk to connect to coach.example");
    type("why this region?");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(sockets[1].url).toContain("mode=teach");
  });

  it("stays disconnected after the relay closes until the next input", async () => {
    const socket = await connected();
    socket.receive({ type: "error", message: "Disconnected after one minute without activity." });
    socket.onclose?.();
    expect(status()).toBe("Disconnected. Type or press Talk to reconnect");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toHaveLength(1);
    type("next step?");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    expect(sent(sockets[1])).toContainEqual({ type: "text", text: "next step?" });
  });

  it("drops queued input when the coach is busy", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    type("hello");
    await vi.waitFor(() => expect(status()).toBe("Can't connect to coach.example. Type or press Talk to retry"));
    expect(sockets).toHaveLength(0);
    type("again");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0]).filter((m) => m.type === "text")).toEqual([{ type: "text", text: "again" }]);
  });
});

describe("calmer panel paths", () => {
  it("applies and restores from the buttons without a microphone or model", async () => {
    $<HTMLButtonElement>("#calmer").click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "customize", preset: "calm" }));
    $<HTMLButtonElement>("#restore").click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith(1, { kind: "customize", preset: null }));
    expect(sockets).toHaveLength(0);
  });

  it.each(["calm", null])("routes the Live model's customize call for %s and replies", async (preset) => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "call-1", name: "customize", args: { preset } });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "customize", preset }));
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "tool_result", id: "call-1", name: "customize", response: { ok: true } })));
  });

  it("rejects arbitrary model CSS before messaging the page", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "bad", name: "customize", args: { preset: "body{display:none}" } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sent(socket)[0].response.error).toContain("Choose preset");
  });
});
