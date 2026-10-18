// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ setMuted:vi.fn(), play:vi.fn(), beginTurn:vi.fn(), turnEnded:vi.fn(), interrupt:vi.fn() }));
vi.mock("./audio.ts", () => ({ Mic: class {}, Speaker: class {
  setMuted = audio.setMuted; play = audio.play; beginTurn = audio.beginTurn; turnEnded = audio.turnEnded; interrupt = audio.interrupt;
} }));
let savedVoice: boolean | undefined;
const storageSet = vi.fn().mockImplementation(async (value: { voiceOut:boolean }) => { savedVoice = value.voiceOut; });

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
  storageSet.mockClear();
  Object.values(audio).forEach((mock) => mock.mockClear());
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ rules: [] }) }));
  vi.stubGlobal("chrome", {
    storage: { local: { get:vi.fn().mockImplementation(async () => ({ voiceOut:savedVoice })), set:storageSet } },
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

function receive(message: object) { sockets[0].onmessage?.({ data:JSON.stringify(message) }); }
describe("spoken replies", () => {
  afterEach(() => { savedVoice = undefined; });
  it("defaults on, mutes independently of input, persists off and keeps captions", async () => {
    const voice = document.querySelector<HTMLButtonElement>("#voice")!;
    expect(voice.getAttribute("aria-pressed")).toBe("true");
    voice.click();
    expect(voice.getAttribute("aria-pressed")).toBe("false");
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalledWith({ voiceOut:false }));
    receive({ type:"transcript", role:"model", text:"Your full reply remains here." });
    expect(document.querySelector("#log")!.textContent).toContain("Your full reply remains here.");
    expect(document.querySelector("#talk")!.hasAttribute("data-on")).toBe(false);
    voice.click();
    expect(audio.setMuted).toHaveBeenLastCalledWith(false);
    receive({ type:"turn_complete" });
    expect(audio.turnEnded).toHaveBeenCalled();
  });
  it("loads a persisted off preference before connecting", async () => {
    savedVoice = false;
    vi.resetModules();
    await import("./sidepanel.ts");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
    expect(document.querySelector("#voice")!.getAttribute("aria-pressed")).toBe("false");
  });
  it("routes the keyboard command to the same toggle", () => {
    const chromeListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    chromeListener({ kind:"toggle_voice" }, {}, vi.fn());
    expect(document.querySelector("#voice")!.getAttribute("aria-pressed")).toBe("false");
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
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
    expect(sendMessage).toHaveBeenCalledWith(1, { kind: "clear_highlight" });
  });

  it("clears the previous ring when a later highlight is ambiguous, and reports fuzzy confidence", async () => {
    await call("read", "read_page", {});
    await call("db", "highlight", { text: "Database" });
    const db = sockets[0].send.mock.calls.map(([raw]) => JSON.parse(raw)).find((message) => message.id === "db");
    expect(db.response.confidence).toBeGreaterThanOrEqual(0.6);
    expect(db.response.confidence).toBeLessThan(1);
    expect(highlights()[0][1].text).toBe("Database");

    sendMessage.mockClear();
    const save = await call("save", "highlight", { text: "Save", role: "button" });
    expect(save).toMatchObject({ found: false, reason: "ambiguous" });
    expect(logText()).toContain('Which "Save" should I point at?');
    expect(sendMessage).toHaveBeenCalledWith(1, { kind: "clear_highlight" });
    expect(highlights()).toHaveLength(0);
  });
});

describe("indistinguishable Saves", () => {
  it("returns the can't-tell-apart ask to the model with no choosable alternatives", async () => {
    sendMessage.mockImplementation(async (_tab: number, msg: { kind: string }) =>
      msg.kind === "read_page"
        ? { url: "http://127.0.0.1/same-save", title: "Same Save", generation: 3, elements: [{ i: 1, role: "button", name: "Save" }, { i: 2, role: "button", name: "Save" }] }
        : { ok: true });
    const call = async (id: string, name: string, args: Record<string, unknown>) => {
      sockets[0].onmessage?.({ data: JSON.stringify({ type: "tool_call", id, name, args }) });
      let result: any;
      await vi.waitFor(() => {
        result = sockets[0].send.mock.calls.map(([raw]) => JSON.parse(raw)).find((m) => m.id === id);
        expect(result).toBeDefined();
      });
      return result.response;
    };
    await call("read", "read_page", {});
    const save = await call("save", "highlight", { text: "Save", role: "button" });
    const apart = `I see more than one "Save" here that I can't tell apart, so I won't point at either. Tell me what's near the one you mean.`;
    expect(save).toEqual({ found: false, reason: "ambiguous", alternatives: [], ask: apart });
    expect(document.querySelector("#log")!.textContent).toContain(apart);
    expect(sendMessage.mock.calls.filter(([, msg]) => msg.kind === "highlight")).toHaveLength(0);
  });
});

describe("duplicate-Save sandbox end to end", () => {
  const ring = () => document.querySelector("guiderail-overlay")!.shadowRoot!.querySelector<HTMLElement>(".ring")!;

  beforeEach(async () => {
    const sandbox = readFileSync("../sandbox/duplicate-save.html", "utf8").match(/<main>[\s\S]*<\/main>/)![0];
    document.body.insertAdjacentHTML("beforeend", sandbox);
    let top = 0;
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const rect = new DOMRect(40, (top += 50), 200, 40);
      el.getBoundingClientRect = () => rect;
      el.getClientRects = () => [rect] as unknown as DOMRectList;
      el.scrollIntoView = () => {};
      el.style.opacity = "1";
    }
    const chrome = (globalThis as any).chrome;
    Object.assign(chrome.runtime, { id: "test-extension", sendMessage: vi.fn().mockResolvedValue({}) });
    await import("./content.ts");
    const page = chrome.runtime.onMessage.addListener.mock.calls[1][0];
    sendMessage.mockImplementation((_tab: number, msg: unknown) => new Promise((resolve) => page(msg, {}, resolve)));
  });

  afterEach(() => { (globalThis as any).chrome.runtime.id = ""; });

  async function call(id: string, name: string, args: Record<string, unknown>) {
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "tool_call", id, name, args }) });
    let result: any;
    await vi.waitFor(() => {
      result = sockets[0].send.mock.calls.map(([raw]) => JSON.parse(raw)).find((m) => m.id === id);
      expect(result).toBeDefined();
    });
    return result.response;
  }

  it.each([
    { text: "Save", role: "button", section: "Billing" },
    { text: "Billing: Save", role: "button" },
  ])("asks which Save, then rings the Billing Save once the person answers Billing (%o)", async (answer) => {
    const snap = await call("read", "read_page", {});
    const saves = snap.elements.filter((e: { name: string }) => e.name === "Save");
    expect(saves.map((e: { section: string }) => e.section)).toEqual(["Billing", "Security"]);

    const ask = await call("ask", "highlight", { text: "Save", role: "button" });
    expect(ask).toMatchObject({ found: false, reason: "ambiguous", alternatives: ["Billing: Save", "Security: Save"] });
    expect(document.querySelector("#log")!.textContent).toContain('Which "Save" should I point at? I see Billing: Save or Security: Save.');
    expect(ring().hidden).toBe(true);

    const billing = document.querySelector('section[aria-label="Billing"] button')!;
    const chosen = await call("answer", "highlight", answer);
    expect(chosen).toMatchObject({ found: true, i: saves[0].i, name: "Save", confidence: 1 });
    expect(ring().hidden).toBe(false);
    expect(ring().style.top).toBe(`${billing.getBoundingClientRect().top - 4}px`);
  });
});
