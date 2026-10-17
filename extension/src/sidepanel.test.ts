// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./audio.ts", () => ({ Mic: class {}, Speaker: class {} }));

class Socket {
  static OPEN = 1;
  readyState = Socket.OPEN;
  onmessage: ((event: { data: string }) => Promise<void>) | undefined;
  send = vi.fn();
  constructor() { sockets.push(this); }
}
let sockets: Socket[];
const sendMessage = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  sockets = [];
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ rules: [] }) }));
  vi.stubGlobal("chrome", {
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), get: vi.fn().mockResolvedValue({ id: 1 }), sendMessage },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
});

afterEach(() => vi.unstubAllGlobals());

describe("calmer panel paths", () => {
  it("applies and restores from the buttons without a microphone or model", async () => {
    document.querySelector<HTMLButtonElement>("#calmer")!.click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "customize", preset: "calm" }));
    document.querySelector<HTMLButtonElement>("#restore")!.click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenLastCalledWith(1, { kind: "customize", preset: null }));
  });

  it.each(["calm", null])("routes the Live model's customize call for %s and replies", async (preset) => {
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "tool_call", id: "call-1", name: "customize", args: { preset } }) });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "customize", preset }));
    await vi.waitFor(() => expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "tool_result", id: "call-1", name: "customize", response: { ok: true } })));
  });

  it("rejects arbitrary model CSS before messaging the page", async () => {
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "tool_call", id: "bad", name: "customize", args: { preset: "body{display:none}" } }) });
    await vi.waitFor(() => expect(sockets[0].send).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(JSON.parse(sockets[0].send.mock.calls[0][0]).response.error).toContain("Choose preset");
  });

  it("leaves typed requests available without starting the microphone", () => {
    document.querySelector<HTMLInputElement>("#text")!.value = "make it calmer";
    document.querySelector<HTMLFormElement>("#form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "text", text: "make it calmer" }));
  });
});

describe("highlight wiring", () => {
  const snapshot = {
    url: "http://127.0.0.1:8791/duplicate-save.html",
    title: "Permissions",
    generation: 3,
    elements: [
      { i: 1, role: "button", name: "Save", section: "Billing" },
      { i: 2, role: "button", name: "Save", section: "Security" },
      { i: 3, role: "textbox", name: "Database ID" },
    ],
  };

  async function call(id: string, name: string, args: Record<string, unknown>) {
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "tool_call", id, name, args }) });
    let result: any;
    await vi.waitFor(() => {
      result = sockets[0].send.mock.calls.map(([raw]) => JSON.parse(raw)).find((m) => m.id === id);
      expect(result).toBeDefined();
    });
    return result.response;
  }

  const logText = () => document.querySelector("#log")!.textContent ?? "";
  const highlights = () => sendMessage.mock.calls.filter(([, msg]) => msg.kind === "highlight");

  beforeEach(() => {
    sendMessage.mockImplementation(async (_tab: number, msg: { kind: string; index?: number; name?: string }) =>
      msg.kind === "read_page" ? snapshot
        : msg.kind === "highlight" ? { found: true, i: msg.index, name: msg.name, confidence: 1 }
          : { ok: true });
  });

  it("asks which Save, pins a unique target to the read, and refuses after the page moves on", async () => {
    await call("read", "read_page", {});

    const save = await call("save", "highlight", { text: "Save", role: "button" });
    expect(save).toMatchObject({ found: false, reason: "ambiguous" });
    expect(logText()).toContain('Which "Save" should I point at? I see Billing: Save or Security: Save.');
    expect(highlights()).toHaveLength(0);

    const db = await call("db", "highlight", { text: "Database ID" });
    expect(db).toEqual({ found: true, i: 3, name: "Database ID", confidence: 1 });
    expect(highlights()).toEqual([[1, { kind: "highlight", text: "Database ID", generation: 3, index: 3, name: "Database ID" }]]);
    expect(logText()).not.toContain("Pointing at");

    const listener = (globalThis as any).chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ kind: "page_event", text: "Page changed.", generation: 4 }, { tab: { id: 1 } }, () => {});
    const after = await call("after", "highlight", { text: "Database ID" });
    expect(after).toMatchObject({ found: false, reason: "stale" });
    expect(logText()).toContain("This screen changed since I last read it, so I won't point at or fill anything.");
    expect(highlights()).toHaveLength(1);
  });
});
