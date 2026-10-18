// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ setMuted:vi.fn(), play:vi.fn(), beginTurn:vi.fn(), turnEnded:vi.fn(), interrupt:vi.fn() }));
const mic = vi.hoisted(() => ({ onChunk: undefined as ((data: string) => void) | undefined }));
vi.mock("./audio.ts", () => ({
  Mic: class { async start(onChunk: (data: string) => void) { mic.onChunk = onChunk; } stop() {} },
  Speaker: class {
    setMuted = audio.setMuted; play = audio.play; beginTurn = audio.beginTurn; turnEnded = audio.turnEnded; interrupt = audio.interrupt;
  },
}));
const policy = vi.hoisted(() => ({ violations: [] as { ruleId: string; field: string; message: string; severity: string }[] }));
vi.mock("./policy.ts", async (original) => ({ ...(await original<typeof import("./policy.ts")>()), evaluate: () => policy.violations }));
vi.mock("./config.ts", () => ({ HTTP: "https://coach.example", SERVER: "wss://coach.example", SERVER_HOST: "coach.example" }));
let savedVoice: boolean | undefined;
const storageSet = vi.fn().mockImplementation(async (value: { voiceOut:boolean }) => { savedVoice = value.voiceOut; });

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
// The side panel registers its runtime listener first; the content script (when imported) registers second.
const fromPage = (msg: object, sender: { url?: string; tab?: { id: number; url?: string } }, reply: (value: unknown) => void) =>
  vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0](msg, sender as chrome.runtime.MessageSender, reply);
const page = (msg: object, tabId = 1) => fromPage(msg, { tab: { id: tabId } }, () => {});
const form = { sections: [], fields: [] };
const sendMessage = vi.fn().mockResolvedValue({ ok: true });
const fetchMock = vi.fn(async (url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> => url.endsWith("/session")
  ? { ok: true, json: async () => ({ credential: "one-use" }) }
  : { ok: true, json: async () => ({ rules: [] }) });
const sessionRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/session")).length;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const status = () => $("#status").lastChild?.textContent;
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
  policy.violations = [];
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  storageSet.mockClear();
  Object.values(audio).forEach((mock) => mock.mockClear());
  fetchMock.mockClear();
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() }, getURL: (path: string) => path },
    storage: {
      local: { get:vi.fn().mockImplementation(async () => ({ voiceOut:savedVoice })), set:storageSet },
      session: { set: vi.fn(), remove: vi.fn() },
    },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), get: vi.fn().mockResolvedValue({ id: 1 }), sendMessage, create: vi.fn() },
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

function receive(message: object) { sockets[0].onmessage?.({ data:JSON.stringify(message) }); }
describe("spoken replies", () => {
  afterEach(() => { savedVoice = undefined; });
  it("defaults on, mutes independently of input, persists off and keeps captions", async () => {
    await connected();
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
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/rules"))).toHaveLength(2));
    expect(sockets).toHaveLength(0);
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

  beforeEach(async () => {
    sendMessage.mockImplementation(async (_tab: number, msg: { kind: string; index?: number; name?: string }) =>
      msg.kind === "read_page" ? snapshot
        : msg.kind === "highlight" ? { found: true, i: msg.index, name: msg.name, confidence: 1 }
          : { ok: true });
    await connected();
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
    await connected();
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
    await connected();
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

describe("page activity across idle disconnects", () => {
  it("does not forward account-page messages even from the bound tab", async () => {
    const socket = await connected();
    const sender = { url: "https://accounts.google.com/signin", tab: { id: 1 } };
    const reply = vi.fn();
    fromPage({ kind: "page_event", text: "sensitive-account-marker" }, sender, reply);
    fromPage({ kind: "teach_status" }, sender, reply);
    expect(reply).toHaveBeenCalledWith({ on: false });
    expect(socket.send).not.toHaveBeenCalled();
    expect($("#log").textContent).not.toContain("sensitive-account-marker");
  });

  it("refuses account-page read tools before injecting or messaging the tab", async () => {
    const socket = await connected();
    sendMessage.mockClear();
    const account = { id: 1, url: "https://accounts.google.com/signin" };
    Object.assign(chrome.tabs, { query: vi.fn().mockResolvedValue([account]), get: vi.fn().mockResolvedValue(account) });
    socket.receive({ type: "tool_call", id: "account-read", name: "read_page", args: {} });
    await vi.waitFor(() => expect(sent(socket)).toContainEqual({ type: "tool_result", id: "account-read", name: "read_page", response: { error: "GuideRail does not read or record sensitive account pages." } }));
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("remembers bound-tab page events while disconnected and summarises them on the next connection", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    page({ kind: "page_event", text: "User clicked the highlighted Labels" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toHaveLength(0);
    type("what next?");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    const [summary, text] = sent(sockets[0]);
    expect(summary).toMatchObject({ type: "session", text: expect.stringContaining("Page event: User clicked the highlighted Labels") });
    expect(text).toEqual({ type: "text", text: "what next?" });
  });

  it("includes page events that arrive while connecting in the summary, before the first typed input", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    type("what next?");
    page({ kind: "page_event", text: 'User clicked "Labels"' });
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    page({ kind: "page_event", text: "Labels section opened" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    sockets[0].receive({ type: "ready" });
    const messages = sent(sockets[0]);
    expect(messages.map((m) => m.type)).toEqual(["session", "text"]);
    expect(messages[0].text).toContain('Page event: User clicked "Labels"');
    expect(messages[0].text).toContain('Page event: User clicked "Create" and all policy checks pass.');
    expect(messages[0].text).toContain("Page event: Labels section opened");
    expect(messages[0].text).not.toContain("what next?");
    expect(messages[1]).toEqual({ type: "text", text: "what next?" });
  });

  it("remembers delivered and undelivered typed input for the next connection", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    type("first try");
    await vi.waitFor(() => expect(status()).toBe("Can't connect to coach.example. Type or press Talk to retry"));
    type("second try");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    sockets[0].onclose?.();
    type("third try");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    const [summary] = sent(sockets[1]);
    expect(summary.text).toContain("User said: first try");
    expect(summary.text).toContain("User said: second try");
    expect(summary.text).not.toContain("third try");
  });

  it("forwards bound-tab page events while connected and ignores other tabs", async () => {
    const socket = await connected();
    page({ kind: "page_event", text: "Background tab changed" }, 2);
    page({ kind: "page_event", text: "User clicked the highlighted Labels" });
    expect(sent(socket)).toEqual([{ type: "event", text: "User clicked the highlighted Labels" }]);
    expect(document.body.textContent).not.toContain("Background tab changed");
  });

  it("reconnects for a blocking submit warning and delivers it once ready", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0])).toEqual([{ type: "event", text: expect.stringContaining("Add an owner label.") }]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a blocking submit warning prominently when the daily allowance is used", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "error", message: "Today's demo voice allowance is used." });
    sockets[0].onclose?.();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Add an owner label.");
  });

  it("shows a blocking submit warning prominently when session admission fails", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Add an owner label."));
    expect(sockets).toHaveLength(0);
  });

  it("does not connect for a passing submit while disconnected", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    page({ kind: "submit_intent", label: "Create", form });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sessionRequests()).toBe(0);
  });
});
