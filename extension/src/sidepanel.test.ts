// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDraft } from "../../server/src/journeys/fixture.ts";
import { FIRESTORE_GOAL } from "../../shared/journey.ts";
import { PUBLIC_DOCS } from "./document.ts";

const audio = vi.hoisted(() => ({ setMuted:vi.fn(), play:vi.fn(), beginTurn:vi.fn(), turnEnded:vi.fn(), interrupt:vi.fn() }));
const mic = vi.hoisted(() => ({ denied: false, onChunk: undefined as ((data: string) => void) | undefined }));
vi.mock("./audio.ts", () => ({
  Mic: class { async start(onChunk: (data: string) => void) { if (mic.denied) throw new Error("denied"); mic.onChunk = onChunk; } stop() {} },
  Speaker: class {
    setMuted = audio.setMuted; play = audio.play; beginTurn = audio.beginTurn; turnEnded = audio.turnEnded; interrupt = audio.interrupt;
  },
}));
const policy = vi.hoisted(() => ({ violations: [] as { ruleId: string; field: string; message: string; severity: string }[] }));
vi.mock("./policy.ts", async (original) => ({ ...(await original<typeof import("./policy.ts")>()), evaluate: () => policy.violations }));
const config = vi.hoisted(() => ({ firebaseKey: "" }));
vi.mock("./config.ts", () => ({ HTTP: "https://coach.example", SERVER: "wss://coach.example", SERVER_HOST: "coach.example", get FIREBASE_API_KEY() { return config.firebaseKey; } }));
let savedVoice: boolean | undefined;
const storageSet = vi.fn().mockImplementation(async (value: { voiceOut:boolean }) => { savedVoice = value.voiceOut; });

class Socket {
  static OPEN = 1;
  readyState = Socket.OPEN;
  onmessage: ((event: { data: string }) => void) | undefined;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | undefined;
  onerror: (() => void) | undefined;
  send = vi.fn();
  close = vi.fn(() => this.closed(1005));
  constructor(readonly url: string) { sockets.push(this); }
  get params() { return new URL(this.url).searchParams; }
  closed(code: number) { this.readyState = 3; this.onclose?.({ code, wasClean: code !== 1006 }); }
  receive(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}
let sockets: Socket[];
// The side panel registers its runtime listener first; the content script (when imported) registers second.
const fromPage = (msg: object, sender: { url?: string; tab?: { id: number; url?: string } }, reply: (value: unknown) => void) =>
  vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0](msg, sender as chrome.runtime.MessageSender, reply);
const page = (msg: object, tabId = 1) => fromPage(msg, { tab: { id: tabId } }, () => {});
const form = { url: "console.cloud.google.com/run/create", sections: [], labels: {}, fields: {} };
const sendMessage = vi.fn().mockResolvedValue({ ok: true });
const queryTabs = vi.fn();
const getTab = vi.fn();
const session = { set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
const defaultFetch = async (url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> => url.endsWith("/session")
  ? { ok: true, json: async () => ({ credential: "one-use" }) }
  : { ok: true, json: async () => ({ rules: [] }) };
const fetchMock = vi.fn(defaultFetch);
const sessionRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/session")).length;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const status = () => $("#status").lastChild?.textContent;
const sent = (socket: Socket) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));

const panelHtml = () => readFileSync("public/sidepanel.html", "utf8")
  .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");

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
  mic.denied = false;
  policy.violations = [];
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  storageSet.mockClear();
  Object.values(audio).forEach((mock) => mock.mockClear());
  fetchMock.mockReset().mockImplementation(defaultFetch);
  session.set.mockClear();
  session.remove.mockClear();
  getTab.mockReset().mockResolvedValue({ id: 1 });
  queryTabs.mockReset().mockResolvedValue([{ id: 1 }]);
  document.body.innerHTML = panelHtml();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() }, getURL: (path: string) => path },
    storage: {
      local: { get:vi.fn().mockImplementation(async () => ({ voiceOut:savedVoice })), set:storageSet },
      session,
    },
    tabs: { query: queryTabs, get: getTab, sendMessage, create: vi.fn().mockResolvedValue({ id: 2 }) },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://coach.example/rules"));
});

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("audit recovery and announcements", () => {
  it("keeps offline text out of delivered chat, retries connection, then requires Send", async () => {
    type("  retain this exact draft  ");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(document.querySelector("#log .user")).toBeNull();
    sockets[0].onerror?.();
    sockets[0].closed(1006);
    expect($("#server-banner").hidden).toBe(false);
    expect($("#server-message").textContent).toContain("Can't reach coach.example");
    expect($<HTMLInputElement>("#text").value).toBe("  retain this exact draft  ");
    expect(document.querySelector("#log .user")).toBeNull();
    $("#server-retry").click();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    expect($("#server-banner").hidden).toBe(true);
    expect(sent(sockets[1])).toEqual([]);
    type($<HTMLInputElement>("#text").value);
    expect(sent(sockets[1])).toEqual([{ type: "text", text: "  retain this exact draft  " }]);
    expect(document.querySelector("#log .user")?.textContent).toBe("  retain this exact draft  ");
    expect($<HTMLInputElement>("#text").value).toBe("");
  });

  const lose = (socket: Socket, handshake: boolean) => { if (handshake) socket.onerror?.(); socket.closed(1006); };

  it("backs off 2, 4, 8, 16, 30 seconds after transport loss and stops after five automatic retries, even if each reconnects", async () => {
    await connected();
    vi.useFakeTimers();
    for (const [index, delay] of [2000, 4000, 8000, 16000, 30000].entries()) {
      lose(sockets[index], index % 2 === 1);
      expect($("#server-message").textContent).toContain(index % 2 ? "Can't reach coach.example" : "Disconnected");
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(sockets).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(index + 2);
      sockets[index + 1].receive({ type: "ready" });
    }
    lose(sockets[5], false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(6);
    expect($("#server-message").textContent).toContain("Retry when you're ready");
    $("#server-retry").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(7);
    lose(sockets[6], false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets).toHaveLength(8);
  });

  it.each([
    [4000, "Disconnected after one minute without activity. Type or tap the mic to reconnect."],
    [4000, "This demo session reached its ten-minute limit."],
    [4000, "This demo session reached its session or daily voice limit."],
    [4001, "Missing, invalid or expired session credential. Reconnect from the extension."],
    [1005, "Couldn't reach the voice model: unavailable"],
  ])("does not reopen a session after the server's deliberate %s close: %s", async (code, message) => {
    const socket = await connected();
    vi.useFakeTimers();
    socket.receive({ type: "error", message });
    socket.closed(code);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(sessionRequests()).toBe(1);
    expect($("#server-banner").hidden).toBe(false);
    expect($("#server-message").textContent).toContain("Retry when you're ready");
  });

  it("announces the completed reply once instead of streaming fragments", async () => {
    const socket = await connected();
    socket.receive({ type: "transcript", role: "model", text: "First " });
    socket.receive({ type: "transcript", role: "model", text: "reply." });
    expect($("#log").hasAttribute("aria-live")).toBe(false);
    expect($("#reply-status").textContent).toBe("");
    socket.receive({ type: "turn_complete" });
    expect($("#reply-status").getAttribute("role")).toBe("status");
    expect($("#reply-status").textContent).toBe("First reply.");
  });

  it.each([0, 2])("stops recording after a failed draft with %s captured steps", async (count) => {
    $("#teach").click();
    await vi.waitFor(() => expect($("#teachbar").hidden).toBe(false));
    for (let i = 0; i < count; i++) page({ kind: "teach_event", event: { t: "navigate", at: Date.now(), url: `https://example.com/${i}`, title: `Page ${i}` } });
    fetchMock.mockImplementation(async (url) => url.endsWith("/playbooks/draft")
      ? { ok: false, json: async () => ({ error: "Draft rejected" }) } : defaultFetch(url));
    $("#teachstop").click();
    await vi.waitFor(() => expect($("#teach-failed").hidden).toBe(false));
    expect($("#teachbar").hidden).toBe(true);
    expect($("#teach[role=switch]").getAttribute("aria-checked")).toBe("false");
    expect($("#teach-error").textContent).toContain(count ? "Recording stopped. Your 2 steps are saved here" : "No steps recorded. Start a new recording");
    expect($("#teach-retry").hidden).toBe(count === 0);
    if (count) {
      $("#teach-retry").click();
      await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/playbooks/draft"))).toHaveLength(2));
      expect($("#teachbar").hidden).toBe(true);
    }
  });

  it("keeps a named override warning until blocking issues are cleared", async () => {
    policy.violations = [{ ruleId: "owner", field: "Role", message: "Avoid Owner", severity: "block" }];
    page({ kind: "submit_intent", label: "Save", form });
    await vi.waitFor(() => expect($("#policy-override").hidden).toBe(false));
    expect($("#policy-override").getAttribute("role")).toBe("alert");
    expect($("#policy-override").textContent).toContain("Review before Save");
    expect($("#policy-override").textContent).toContain("second click within 10 seconds");
    page({ kind: "submit_intent", label: "Save", form, continued: true });
    await vi.waitFor(() => expect($("#policy-override").textContent).toContain("You continued with Save anyway"));
    expect($("#policy-override").textContent).not.toContain("second click");
    expect($("#policy-override").hidden).toBe(false);
    policy.violations = [];
    page({ kind: "form_changed", form });
    await vi.waitFor(() => expect($("#policy-override").hidden).toBe(true));
  });

  it("reuses and focuses the single microphone setup tab after repeated denials", async () => {
    mic.denied = true;
    const update = vi.fn().mockResolvedValue({});
    const focus = vi.fn().mockResolvedValue({});
    Object.assign(chrome.tabs, { update });
    Object.assign(chrome, { windows: { update: focus } });
    queryTabs.mockImplementation(async (query) => query.url ? [] : [{ id: 1 }]);
    $("#talk").click();
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(1));
    queryTabs.mockImplementation(async (query) => query.url ? [{ id: 2, windowId: 3 }] : [{ id: 1 }]);
    $("#talk").click();
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(2, { active: true }));
    expect(focus).toHaveBeenCalledWith(3, { focused: true });
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });
});

describe("readable current panel guidance", () => {
  it("renders streamed model emphasis and code while leaving HTML and unsafe links literal", async () => {
    const socket = await connected();
    socket.receive({ type: "transcript", role: "model", text: "Choose **Production" });
    socket.receive({ type: "transcript", role: "model", text: " mode** and *review* `Next`. <img src=x onerror=alert(1)> [x](javascript:alert(1))" });
    const reply = $(".msg.model");
    expect(reply.querySelector("strong")?.textContent).toBe("Production mode");
    expect(reply.querySelector("em")?.textContent).toBe("review");
    expect(reply.querySelector("code")?.textContent).toBe("Next");
    expect(reply.querySelector("img,a,script")).toBeNull();
    expect(reply.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  it("keeps repeated page and passing-submit events in model context without adding chat noise", async () => {
    const socket = await connected();
    for (let i = 0; i < 4; i++) page({ kind: "page_event", text: 'User clicked "Next".' });
    page({ kind: "submit_intent", label: "Next", form });
    await vi.waitFor(() => expect(sent(socket).filter((m) => m.type === "event")).toHaveLength(5));
    expect($("#log").textContent).not.toContain("User clicked");
  });
  it("uses one working line for concurrent slow tools and settles after failure", async () => {
    const socket = await connected();
    const finishes: ((result: unknown) => void)[] = [];
    sendMessage.mockImplementation(() => new Promise((resolve) => { finishes.push(resolve); }));
    socket.receive({ type: "tool_call", id: "read", name: "read_page", args: {} });
    await vi.waitFor(() => expect(finishes).toHaveLength(1));
    expect($("#working").textContent).toBe("Reading the page…");
    socket.receive({ type: "tool_call", id: "check", name: "check_policy", args: {} });
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    expect(document.querySelectorAll("#working")).toHaveLength(1);
    expect($("#working").textContent).toBe("Checking policy…");
    expect($("#log").getAttribute("aria-busy")).toBe("true");
    finishes[0]({ url: "https://console.firebase.google.com/", title: "Firestore", generation: 1, elements: [] });
    await vi.waitFor(() => expect(sent(socket).some((m) => m.id === "read")).toBe(true));
    expect($("#working").hidden).toBe(false);
    finishes[1]({ error: "The page changed." });
    await vi.waitFor(() => expect($("#working").hidden).toBe(true));
    expect($("#log").getAttribute("aria-busy")).toBe("false");
  });
  it.each(["turn_complete", "error", "interrupted", "disconnect"])("clears pending working state on %s, including late tool completion", async (event) => {
    const socket = await connected();
    let finish: (result: unknown) => void = () => {};
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    socket.receive({ type: "tool_call", id: "read", name: "read_page", args: {} });
    await vi.waitFor(() => expect($("#working").hidden).toBe(false));
    if (event === "disconnect") socket.closed(1000); else socket.receive({ type: event, message: "Fixture error" });
    expect($("#working").hidden).toBe(true);
    finish({ url: "https://console.firebase.google.com/", title: "Firestore", generation: 1, elements: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect($("#working").hidden).toBe(true);
    expect($("#log").getAttribute("aria-busy")).toBe("false");
  });
  it("clears resolved Violations and rejects a stale response after navigation", async () => {
    await connected();
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner.", severity: "block" }];
    page({ kind: "form_changed", form });
    await vi.waitFor(() => expect($("#issues").hidden).toBe(false));
    policy.violations = [];
    page({ kind: "form_changed", form });
    await vi.waitFor(() => expect($("#issues").hidden).toBe(true));
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner.", severity: "block" }];
    let finish: (result: unknown) => void = () => {};
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    page({ kind: "form_changed", form });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    page({ kind: "tab_changed", tabId: 1, url: "https://console.firebase.google.com/project/other/firestore" });
    finish({ shown: ["Labels"] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect($("#issues").hidden).toBe(true);
    expect($("#issues-list").children).toHaveLength(0);
  });
  it.each([
    ["tab_changed", { kind: "tab_changed", tabId: 1, url: "https://console.firebase.google.com/project/other/firestore" }],
    ["page_event", { kind: "page_event", text: "The page changed.", generation: 2 }],
  ])("keeps the override notice hidden after %s during a held submit, but still warns the coach", async (_name, change) => {
    const socket = await connected();
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner.", severity: "block" }];
    let finish: (result: unknown) => void = () => {};
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    page({ kind: "submit_intent", label: "Create", form, continued: true });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "show_violations" })));
    sendMessage.mockResolvedValue({ ok: true });
    page(change);
    finish({ shown: ["Labels"] });
    await vi.waitFor(() => expect(sent(socket)).toContainEqual({ type: "event", text: expect.stringContaining('User is about to click "Create" but 1 to fix (1 Rule) remain: Add an owner.') }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect($("#policy-override").hidden).toBe(true);
  });
});

describe("lazy Live connection", () => {
  it("does not request a session or open a socket when the panel opens", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sessionRequests()).toBe(0);
    expect(sockets).toHaveLength(0);
    expect(status()).toBe("Type or tap the mic to connect to coach.example");
  });

  it("connects on the first typed message and delivers it once the relay is ready", async () => {
    type("where are labels?");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(sessionRequests()).toBe(1);
    expect(sockets[0].url).toContain("credential=one-use");
    expect(sockets[0].send).not.toHaveBeenCalled();
    expect(status()).toBe("Connecting…");
    expect($("#status .connection-dot")).not.toBeNull();
    sockets[0].receive({ type: "ready" });
    expect($("#status").textContent).toBe("");
    expect($("#status").title).toBe("Connected to coach.example");
    expect($("#status").getAttribute("aria-label")).toBe("Connected to coach.example");
    expect($("#status").dataset.state).toBe("on");
    expect($("#status .connection-dot").getAttribute("aria-hidden")).toBe("true");
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

  it("toggling Teach with Assist merely selected sends no Assist Stop", async () => {
    const socket = await connected();
    $<HTMLSelectElement>("#assist-level").value = "assist";
    $("#assist-level").dispatchEvent(new Event("change"));
    $<HTMLButtonElement>("#teach").click();
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    $<HTMLButtonElement>("#teach").click();
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/playbooks/draft"))).toBe(true));
    expect(sent(socket).some((m) => m.type === "app" && /Assist stop/.test(m.text))).toBe(false);
    expect($("[data-assist-status]").textContent).not.toMatch(/stopped|Already filled/);
  });
  it("switches between Teach and Guide without connecting", async () => {
    const socket = await connected();
    $<HTMLButtonElement>("#teach").click();
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toHaveLength(1);
    expect(sessionRequests()).toBe(1);
    expect(status()).toBe("Type or tap the mic to connect to coach.example");
    type("why this region?");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(sockets[1].url).toContain("mode=teach");
  });

  it("stays disconnected after the relay closes until the next input", async () => {
    const socket = await connected();
    socket.receive({ type: "error", message: "Disconnected after one minute without activity." });
    socket.closed(4000);
    expect(status()).toBe("Disconnected. Type or tap the mic to reconnect");
    expect($("#status").title).toBe(status());
    expect($("#status").getAttribute("aria-label")).toBe(status());
    expect($("#status .connection-dot")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sockets).toHaveLength(1);
    type("next step?");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    expect(sent(sockets[1])).toContainEqual({ type: "text", text: "next step?" });
  });

  it("keeps queued input in the composer when the coach is busy, and sends only the next explicit submission", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    type("hello");
    await vi.waitFor(() => expect(status()).toBe("Can't connect to coach.example. Type or tap the mic to retry"));
    expect(sockets).toHaveLength(0);
    expect($<HTMLInputElement>("#text").value).toBe("hello");
    expect($<HTMLInputElement>("#text").readOnly).toBe(false);
    type("again");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0]).filter((m) => m.type === "text")).toEqual([{ type: "text", text: "again" }]);
  });

  it("retains exact text through a failed socket without silently resending it on a warning reconnect", async () => {
    const exact = `  Deploy the service with these exact settings:  ${"word ".repeat(180)}  `;
    type(exact);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    expect($<HTMLInputElement>("#text").readOnly).toBe(true);
    sockets[0].closed(1006);
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    expect($<HTMLInputElement>("#text").readOnly).toBe(false);
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    expect(JSON.stringify(sent(sockets[1]))).not.toContain("Deploy the service");
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    type($<HTMLInputElement>("#text").value);
    expect(sent(sockets[1]).filter((msg) => msg.type === "text")).toEqual([{ type: "text", text: exact }]);
    expect($<HTMLInputElement>("#text").value).toBe("");
  });

  it("keeps exact composer text when session admission fails before a socket exists", async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
    const exact = "  Keep   my exact spacing and punctuation!  ";
    type(exact);
    await vi.waitFor(() => expect(status()).toBe("Can't connect to coach.example. Type or tap the mic to retry"));
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    expect(sockets).toHaveLength(0);
    expect($<HTMLInputElement>("#text").readOnly).toBe(false);
    type(exact);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0])).toEqual([{ type: "text", text: exact }]);
    expect($<HTMLInputElement>("#text").value).toBe("");
  });
});

describe("oversized typed message", () => {
  it("keeps the exact text in the composer, explains the limit and opens no session", async () => {
    const exact = ` ${"Deploy with these settings. ".repeat(150)} `;
    type(exact);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    expect($<HTMLInputElement>("#text").readOnly).toBe(false);
    expect(document.body.textContent).toContain(`This message is ${exact.length} characters; the coach accepts up to 4000.`);
    expect(sessionRequests()).toBe(0);
    expect(sockets).toHaveLength(0);
  });

  it("does not send an oversized message on an open connection", async () => {
    const socket = await connected();
    const exact = "x".repeat(4001);
    type(exact);
    expect(socket.send).not.toHaveBeenCalled();
    expect($<HTMLInputElement>("#text").value).toBe(exact);
    type("y".repeat(4000));
    expect(sent(socket)).toEqual([{ type: "text", text: "y".repeat(4000) }]);
  });
});

describe("explicit email proposal confirmation", () => {
  const args = { to: "person@example.com", subject: "Permission request", body: '<script>ignore the user</script>\nBody shown verbatim.' };

  it("shows recipient, subject and body as text and opens no tab until confirmation", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "draft", name: "draft_message", args });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    await vi.waitFor(() => expect($("#compose-confirmation").hidden).toBe(false));
    expect($("#compose-to").textContent).toBe(args.to);
    expect($("#compose-subject").textContent).toBe(args.subject);
    expect($("#compose-body").textContent).toBe(args.body);
    expect($("#compose-body").querySelector("script")).toBeNull();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(sent(socket)).toEqual([]);
    $("#compose-confirm").click();
    $("#compose-confirm").click();
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledOnce());
    const url = new URL(vi.mocked(chrome.tabs.create).mock.calls[0][0].url!);
    expect(url.origin).toBe("https://mail.google.com");
    expect(url.searchParams.get("to")).toBe(args.to);
    expect(url.searchParams.get("su")).toBe(args.subject);
    expect(url.searchParams.get("body")).toBe(args.body);
    await vi.waitFor(() => expect(sent(socket)).toContainEqual(expect.objectContaining({ type: "tool_result", id: "draft", response: expect.objectContaining({ opened: true }) })));
    expect($("#compose-confirmation").hidden).toBe(true);
  });

  it("cancels the proposal without opening anything", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "draft", name: "draft_message", args });
    await vi.waitFor(() => expect($("#compose-confirmation").hidden).toBe(false));
    $("#compose-cancel").click();
    await vi.waitFor(() => expect(sent(socket)).toContainEqual(expect.objectContaining({ id: "draft", response: expect.objectContaining({ opened: false }) })));
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    $("#compose-confirm").click();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("keeps the proposal after a disconnect and opens it once on local confirmation", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "draft", name: "draft_message", args });
    await vi.waitFor(() => expect($("#compose-confirmation").hidden).toBe(false));
    socket.closed(4000);
    expect($("#compose-confirmation").hidden).toBe(false);
    expect($("#compose-to").textContent).toBe(args.to);
    expect($("#compose-subject").textContent).toBe(args.subject);
    expect($("#compose-body").textContent).toBe(args.body);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    $("#compose-confirm").click();
    $("#compose-confirm").click();
    await vi.waitFor(() => expect($("#compose-confirmation").hidden).toBe(true));
    expect(chrome.tabs.create).toHaveBeenCalledOnce();
    expect(new URL(vi.mocked(chrome.tabs.create).mock.calls[0][0].url!).searchParams.get("body")).toBe(args.body);
    expect(sockets).toHaveLength(1);
    expect(sessionRequests()).toBe(1);
    expect(sent(socket)).toEqual([]);
  });

  it("dismisses a proposal kept after a disconnect without opening anything or reconnecting", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "draft", name: "draft_message", args });
    await vi.waitFor(() => expect($("#compose-confirmation").hidden).toBe(false));
    socket.closed(4000);
    $("#compose-cancel").click();
    expect($("#compose-confirmation").hidden).toBe(true);
    $("#compose-confirm").click();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
    expect(sessionRequests()).toBe(1);
  });
});

describe("calmer panel paths", () => {
  it("announces Journey status separately from transcript fragments", () => {
    const status = document.querySelector("[data-status]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect($("#log").hasAttribute("aria-live")).toBe(false);
    expect(document.querySelector("#current-step")!.closest("#log")).toBeNull();
    expect(document.querySelectorAll("#journey [role=status]")).toHaveLength(1);
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

describe("panel mode and icon controls", () => {
  it("shows Learn mode as an on/off switch and stops recording when turned off", async () => {
    fetchMock.mockImplementation(async (url) => url.endsWith("/playbooks/draft")
      ? { ok: false, json: async () => ({ error: "Draft fixture unavailable" }) }
      : defaultFetch(url));
    const learn = $<HTMLButtonElement>("#teach[role=switch]");
    const description = "Learn mode: show GuideRail how you do a task so it can draft a Playbook";
    expect(learn.getAttribute("aria-label")).toBe(description);
    expect(learn.title).toBe(description);
    expect(learn.getAttribute("aria-checked")).toBe("false");
    expect(learn.textContent?.trim()).toBe("Learn");
    learn.click();
    expect(learn.getAttribute("aria-checked")).toBe("true");
    expect(learn.textContent?.trim()).toBe("Learn");
    await vi.waitFor(() => expect($("#teachbar").hidden).toBe(false));
    expect(sendMessage).toHaveBeenCalledWith(1, { kind: "teach", on: true });
    learn.click();
    await vi.waitFor(() => expect(learn.getAttribute("aria-checked")).toBe("false"));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/playbooks/draft"))).toBe(true));
    expect(sendMessage).toHaveBeenCalledWith(1, { kind: "teach", on: false });
    expect(learn.textContent?.trim()).toBe("Learn");
    expect(learn.getAttribute("aria-label")).toBe(description);
    expect(learn.title).toBe(description);
  });

  it("keeps mic icons and announces listening until the stop control is pressed", async () => {
    const talk = $<HTMLButtonElement>("button[aria-label=Talk]");
    expect(talk.title).toBe("Talk");
    talk.click();
    await vi.waitFor(() => expect(talk.getAttribute("aria-label")).toBe("Stop listening"));
    expect(talk.getAttribute("aria-pressed")).toBe("true");
    expect($("#mic-status").textContent).toContain("Listening");
    expect(talk.querySelectorAll("svg")).toHaveLength(2);
    $<HTMLButtonElement>("button[aria-label='Stop listening']").click();
    expect(talk.getAttribute("aria-pressed")).toBe("false");
    expect(talk.getAttribute("aria-label")).toBe("Talk");
    expect($("#mic-status").textContent).toBe("");
    expect(talk.querySelectorAll("svg")).toHaveLength(2);
  });

  it("submits typed text with the named send icon", async () => {
    $<HTMLInputElement>("#text").value = "make the page calmer";
    const send = $<HTMLButtonElement>("button[aria-label=Send]");
    expect(send.title).toBe("Send");
    send.click();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    await vi.waitFor(() => expect(sent(sockets[0])).toContainEqual({ type: "text", text: "make the page calmer" }));
  });
});

function receive(message: object) { sockets[0].onmessage?.({ data:JSON.stringify(message) }); }
describe("spoken replies", () => {
  afterEach(() => { savedVoice = undefined; });
  it("defaults on, mutes independently of input, persists off and keeps captions", async () => {
    await connected();
    const voice = $<HTMLButtonElement>("button[aria-label='Spoken replies']");
    expect(voice.getAttribute("aria-pressed")).toBe("true");
    voice.click();
    expect(voice.getAttribute("aria-pressed")).toBe("false");
    expect(voice.getAttribute("aria-label")).toBe("Spoken replies");
    expect(voice.title).toBe("Spoken replies off (Alt+Shift+V)");
    expect(voice.querySelector("svg")).not.toBeNull();
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

describe("public docs briefing", () => {
  it.each([true, false])("points to IAM's grant heading and reports highlight found=%s honestly", async (found) => {
    queryTabs.mockResolvedValue([{ id: 1, url: PUBLIC_DOCS[1] }]);
    const doc = { url: PUBLIC_DOCS[1], title: "Grant IAM access", text: "Grant a single IAM role to a principal.", headings: ["Before you begin", "Grant a single IAM role"] };
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_document" ? doc : { found });
    expect(sockets).toHaveLength(0);
    document.querySelector<HTMLButtonElement>("[data-brief]")!.click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "highlight_document", heading: "Grant a single IAM role" }));
    const status = document.querySelector("[data-status]")!;
    if (found) {
      await vi.waitFor(() => expect(status.textContent).toContain("Briefing requested"));
      await vi.waitFor(() => expect(sockets).toHaveLength(1));
      expect(sockets[0].send).not.toHaveBeenCalled();
      sockets[0].receive({ type: "ready" });
      expect(sockets[0].send).toHaveBeenCalledWith(expect.stringContaining("Brief me from this page using only"));
      expect(JSON.parse(sockets[0].send.mock.calls[0][0]).text).toContain(doc.text);
    } else {
      await vi.waitFor(() => expect(status.textContent).toContain("Couldn't point to “Grant a single IAM role”"));
      expect(status.textContent).not.toContain("Briefing requested");
      expect(sockets).toHaveLength(0);
      expect(sessionRequests()).toBe(0);
    }
  });
});

describe("long public docs briefing", () => {
  it("delivers a brief of a long page within one relay message", async () => {
    queryTabs.mockResolvedValue([{ id: 1, url: PUBLIC_DOCS[0] }]);
    const doc = { url: PUBLIC_DOCS[0], title: "Manage databases", text: "Create a Firestore database in a location. ".repeat(280), headings: ["Create a database", ...Array.from({ length: 59 }, (_, k) => `Section ${k}`)] };
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_document" ? doc : { found: true });
    document.querySelector<HTMLButtonElement>("[data-brief]")!.click();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    const [brief] = sent(sockets[0]);
    expect(brief.type).toBe("text");
    expect(brief.text.length).toBeLessThanOrEqual(4000);
    const snapshot = JSON.parse(brief.text.slice(brief.text.indexOf("\n") + 1));
    expect(snapshot.headings[0]).toBe("Create a database");
    expect(snapshot.truncated).toContain(`of ${doc.text.length} characters`);
  });
});

describe("compile during Teach", () => {
  it("leaves Teach connected and starts Guide fresh with the compiled Goal", async () => {
    await connected();
    const compiled = { cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 100, compiledAt: "2026-10-17T23:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } };
    let respond!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url) => String(url).endsWith("/journeys/compile")
      ? new Promise<Response>((resolve) => { respond = resolve; })
      : String(url).endsWith("/session") ? new Response(JSON.stringify({ credential: "one-use" }))
      : new Response(JSON.stringify({ error: "offline" }), { status: 503 }));
    await sockets[0].onmessage?.({ data: JSON.stringify({ type: "resumption", handle: "pre-compile" }) });
    expect(session.set).toHaveBeenCalledWith({ resumeHandle: "pre-compile" });

    document.querySelector<HTMLButtonElement>("[data-compile]")!.click();
    document.querySelector<HTMLButtonElement>("#teach")!.click();
    await vi.waitFor(() => expect(status()).toBe("Type or tap the mic to connect to coach.example"));
    type("Explain this step");
    await vi.waitFor(() => expect(sockets.at(-1)!.params.get("mode")).toBe("teach"));
    const teach = sockets.at(-1)!;

    respond(new Response(JSON.stringify(compiled)));
    await vi.waitFor(() => expect(document.querySelector("[data-status]")!.textContent).toContain("from cache"));
    expect(sockets.at(-1)).toBe(teach);
    expect(teach.close).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("#teachstop")!.click();
    await vi.waitFor(() => expect(status()).toBe("Type or tap the mic to connect to coach.example"));
    type("Continue the Journey");
    await vi.waitFor(() => expect(sockets.at(-1)!.params.get("mode")).toBe("guide"));
    expect(sockets.at(-1)!.params.get("goalId")).toBe(FIRESTORE_GOAL.id);
    expect(sockets.at(-1)!.params.has("resume")).toBe(false);
  });
});

describe("bound Journey tool and event routing", () => {
  beforeEach(async () => { await connected(); });
  const boundUrl = "https://console.firebase.google.com/project/zoop-innovation/firestore/databases";
  async function start() {
    vi.mocked(fetch).mockImplementation(async (url) => String(url).endsWith("/session") ? new Response(JSON.stringify({ credential: "one-use" })) : new Response(JSON.stringify({ cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 1, compiledAt: "2026-10-18T00:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } })));
    chrome.tabs.create = vi.fn().mockResolvedValue({ id: 7, url: FIRESTORE_GOAL.consoleUrl });
    getTab.mockResolvedValue({ id: 7, url: boundUrl });
    queryTabs.mockResolvedValue([{ id: 7, url: boundUrl }]);
    document.querySelector<HTMLButtonElement>("[data-open]")!.click();
    await vi.waitFor(() => expect(document.querySelectorAll("#journey li")).toHaveLength(10));
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets.at(-1)!.receive({ type: "ready" });
    sockets.at(-1)!.send.mockClear();
    sendMessage.mockClear();
  }
  async function tool(name: string, args: object = {}) {
    const socket = sockets.at(-1)!;
    socket.onmessage?.({ data: JSON.stringify({ type: "tool_call", id: name, name, args }) });
    await vi.waitFor(() => expect(socket.send.mock.calls.some(([payload]) => JSON.parse(payload).type === "tool_result")).toBe(true));
    const payload = socket.send.mock.calls.find(([payload]) => JSON.parse(payload).type === "tool_result")![0];
    socket.send.mockClear(); return JSON.parse(payload).response;
  }
  it("rejects model URLs before opening any tab", async () => {
    chrome.tabs.create = vi.fn();
    expect(await tool("open_page", { goalId: FIRESTORE_GOAL.id, url: "https://evil.example" })).toHaveProperty("error");
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
  it("refuses model fill/click requests in default Guide without touching the page", async () => {
    expect(await tool("fill_field", { fieldName: "Database ID", value: "customer-db" })).toHaveProperty("error");
    for (const name of ["click", "submit", "send"]) expect(await tool(name, { text: "Create" })).toHaveProperty("error");
    expect(sendMessage).not.toHaveBeenCalled();
  });
  let value: string;
  let generation: number;
  async function planAssist() {
    await start();
    value = "(default)"; generation = 8;
    sendMessage.mockImplementation(async (_id, message) => {
      if (message.kind === "read_page") return { url: boundUrl, title: "Fixture", generation: ++generation, elements: [{ i: 1, name: "Database ID", role: "textbox", value }] };
      if (message.kind === "pin_field") return message.generation === 9 && message.index === 1 ? { pin: 3 } : { error: "stale" };
      if (message.kind === "read_form") return { url: boundUrl.replace("https://", ""), fields: { "Database ID": value }, labels: {}, sections: [] };
      if (message.kind === "fill_field") { value = message.value; return { filled: true }; }
      return { ok: true };
    });
    $<HTMLSelectElement>("#assist-level").value = "assist";
    $("#assist-level").dispatchEvent(new Event("change"));
    $<HTMLInputElement>("#assist-id").value = "customer-db";
    $("#assist-questions").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect($<HTMLButtonElement>("[data-approve]").disabled).toBe(false));
  }
  it("routes an approved Assist fill only to the bound page, verifies readback, and rechecks Rules", async () => {
    await planAssist();
    expect(sendMessage.mock.calls.some(([, msg]) => msg.kind === "fill_field")).toBe(false);
    expect(await tool("fill_field", { fieldName: "Database ID", value: "customer-db" })).toHaveProperty("error");
    expect(await tool("read_page")).toMatchObject({ generation: 10 });
    $<HTMLButtonElement>("[data-approve]").click();
    await vi.waitFor(() => expect($("[data-assist-status]").textContent).toContain("Read back Database ID: customer-db"));
    expect(sendMessage).toHaveBeenCalledWith(7, { kind: "fill_field", fieldName: "Database ID", value: "customer-db", pin: 3, retry: false, expectedUrl: boundUrl });
    expect(sendMessage).toHaveBeenCalledWith(7, { kind: "show_violations", violations: [], expectedUrl: boundUrl });
    expect(document.querySelector(".assist-stop")?.closest("#scroll")).toBeNull();
  });
  it("keeps a reviewed plan when a typed or spoken message mentions stop", async () => {
    await planAssist();
    sockets.at(-1)!.receive({ type: "transcript", role: "user", text: "stop" });
    type("Do I need to stop and pick a location first?");
    expect($<HTMLButtonElement>("[data-approve]").disabled).toBe(false);
    expect($("[data-assist-status]").textContent).not.toContain("Assist stopped");
  });
  it.each(["Stop", "an ID edit", "a Test mode choice"])("%s during the final tab check cancels the fill before dispatch", async (change) => {
    await planAssist();
    let release!: () => void;
    let calls = 0;
    const tab = { id: 7, url: boundUrl };
    getTab.mockImplementation(() => {
      // Sixth bound-tab check after approval is the fill option's own validation, after both form reads.
      if (++calls !== 6) return Promise.resolve(tab);
      return new Promise((resolve) => { release = () => resolve(tab); });
    });
    $<HTMLButtonElement>("[data-approve]").click();
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(sendMessage.mock.calls.filter(([, msg]) => msg.kind === "read_form")).toHaveLength(2);
    if (change === "Stop") $<HTMLButtonElement>(".assist-stop").click();
    if (change === "an ID edit") { $<HTMLInputElement>("#assist-id").value = "other-db"; $("#assist-id").dispatchEvent(new Event("input")); }
    if (change === "a Test mode choice") { $<HTMLSelectElement>("#assist-mode").value = "Test mode"; $("#assist-mode").dispatchEvent(new Event("input")); }
    release();
    await vi.waitFor(() => expect($<HTMLButtonElement>("#assist-questions button").disabled).toBe(false));
    expect(sendMessage.mock.calls.some(([, msg]) => msg.kind === "fill_field")).toBe(false);
    expect(value).toBe("(default)");
  });
  it("routes reads and highlights only to the bound tab; tab switching pauses them", async () => {
    await start();
    expect(chrome.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: FIRESTORE_GOAL.consoleUrl });
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: [{ i: 1, role: "radio", name: "Standard edition" }] }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    await tool("read_page");
    expect(sendMessage).toHaveBeenLastCalledWith(7, { kind: "read_page", expectedUrl: boundUrl });
    await tool("highlight", { text: "Standard edition", role: "radio" });
    expect(sendMessage).toHaveBeenLastCalledWith(7, { kind: "highlight", text: "Standard edition", role: "radio", generation: 2, index: 1, name: "Standard edition", expectedUrl: boundUrl });
    sendMessage.mockClear();
    expect(await tool("highlight", { text: "Standard", role: "radio" })).toMatchObject({ found: true, name: "Standard edition", confidence: 0.9 });
    expect(sendMessage.mock.calls.filter(([, message]) => message.kind === "highlight")).toHaveLength(1);
    sendMessage.mockClear(); queryTabs.mockResolvedValue([{ id: 8, url: boundUrl }]);
    expect(await tool("read_page")).toHaveProperty("error"); expect(sendMessage).not.toHaveBeenCalled();
  });
  it("accepts unique fuzzy targets but refuses weak candidates and ties in the bound panel", async () => {
    await start();
    let names = ["Add database"];
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: names.map((name, i) => ({ i, name, role: "button" })) }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    await tool("read_page");
    expect(await tool("highlight", { text: "Add database button", role: "button" })).toMatchObject({ found: true, name: "Add database", confidence: 0.9 });
    expect(sendMessage).toHaveBeenLastCalledWith(7, expect.objectContaining({ kind: "highlight", index: 0, name: "Add database", generation: 2, expectedUrl: boundUrl }));
    for (const [candidates, reason] of [[["Database settings"], "missing"], [["Add database one", "Add database two"], "ambiguous"]] as const) {
      names = [...candidates]; await tool("read_page"); sendMessage.mockClear();
      expect(await tool("highlight", { text: "Add database", role: "button" })).toMatchObject({ found: false, reason });
      expect(sendMessage.mock.calls.some(([, message]) => message.kind === "highlight")).toBe(false);
    }
  });
  it("dispatches End cleanup to the old bound tab before a new Journey can be opened", async () => {
    await start();
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl.replace("https://", ""), title: "Firestore", generation: 2, elements: [] } : { ok: true });
    await tool("read_page"); sendMessage.mockClear();
    document.querySelector<HTMLButtonElement>("[data-reset]")!.click();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(7, { kind: "clear_highlight", expectedUrl: boundUrl });
    expect(document.querySelector<HTMLElement>("#current-step")!.hidden).toBe(true);
  });
  it("accepts the bound reader's host/path form URL and rejects an unrelated one", async () => {
    await start(); const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    const sender = { tab: { id: 7 }, url: boundUrl } as chrome.runtime.MessageSender;
    listener({ kind: "form_changed", form: { url: "console.firebase.google.com/project/zoop-innovation/firestore/databases", labels: {}, fields: {}, sections: [] } }, sender, vi.fn());
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(7, { kind: "show_violations", violations: [], expectedUrl: boundUrl }));
    sendMessage.mockClear();
    listener({ kind: "form_changed", form: { url: "evil.example", labels: {}, fields: {}, sections: [] } }, sender, vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("returns the open_page result to the issuing session and reconnects with the Goal after that turn", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => String(url).endsWith("/session") ? new Response(JSON.stringify({ credential: "one-use" })) : new Response(JSON.stringify({ cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 1, compiledAt: "2026-10-18T00:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } })));
    chrome.tabs.create = vi.fn().mockResolvedValue({ id: 7, url: FIRESTORE_GOAL.consoleUrl });
    const issuing = sockets[0];
    expect(await tool("open_page", { goalId: FIRESTORE_GOAL.id })).toMatchObject({ opened: true, goalId: FIRESTORE_GOAL.id });
    expect(sockets).toHaveLength(1); expect(issuing.close).not.toHaveBeenCalled();
    receive({ type: "resumption", handle: "pre-goal" });
    receive({ type: "turn_complete" });
    expect(issuing.close).toHaveBeenCalled();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(sockets[1].params.get("goalId")).toBe(FIRESTORE_GOAL.id); expect(sockets[1].params.has("resume")).toBe(false);
  });
  it("auto-points on start and same-tab changes, advances a clicked Step, and speaks only with voice on", async () => {
    const speak = vi.fn(); const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(readonly text: string) {} });
    savedVoice = true;
    if ($<HTMLButtonElement>("#voice").getAttribute("aria-pressed") !== "true") $("#voice").click();
    vi.useFakeTimers();
    await start();
    let name = "Databases & Storage";
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: [{ i: 1, role: "button", name }] }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    await vi.advanceTimersByTimeAsync(600);
    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ kind: "highlight", name }));
    expect($("#reply-status").textContent).toBe("Step 1: Databases & Storage. You operate this control.");
    expect(speak).toHaveBeenCalledOnce();
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    const stale = { tab: { id: 7 }, url: FIRESTORE_GOAL.consoleUrl } as chrome.runtime.MessageSender;
    listener({ kind: "page_event", text: 'User clicked "Databases & Storage".' }, stale, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    name = "Firestore";
    expect($("#current-step h2").textContent).toBe("Step 2 of 10 · Firestore");
    $("#voice").click();
    listener({ kind: "page_event", text: "Page changed.", generation: 3 }, stale, vi.fn());
    await vi.advanceTimersByTimeAsync(600);
    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ kind: "highlight", name }));
    expect($("#reply-status").textContent).toContain("Step 2: Firestore");
    expect(speak).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalled();
    sendMessage.mockClear();
    listener({ kind: "tab_changed", tabId: 8 }, {}, vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sendMessage.mock.calls.some(([, message]) => message.kind === "read_page" || message.kind === "highlight")).toBe(false);
  });
  it("does not auto-read an unbound tab when activation changes before the scheduled read", async () => {
    vi.useFakeTimers(); await start();
    getTab.mockResolvedValue({ id: 7, url: boundUrl });
    queryTabs.mockResolvedValue([{ id: 8, url: "https://example.com" }]);
    sendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sendMessage.mock.calls.some(([, message]) => message.kind === "read_page" || message.kind === "highlight")).toBe(false);
    expect(document.querySelector("#log .step")).toBeNull();
  });
  it("drops foreign-tab and sign-in events and refuses model completion", async () => {
    await start(); const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    const socket = sockets.at(-1)!; socket.send.mockClear();
    listener({ kind: "page_event", text: "foreign secret" }, { tab: { id: 8 }, url: boundUrl } as chrome.runtime.MessageSender, vi.fn());
    listener({ kind: "page_event", text: "sign-in secret" }, { tab: { id: 7 }, url: "https://accounts.google.com/signin" } as chrome.runtime.MessageSender, vi.fn());
    expect(socket.send).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain("secret");
    expect(await tool("complete_step", { summary: "database created" })).toHaveProperty("error");
    expect(document.querySelector("#log")!.textContent).not.toContain("Done · database created");
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

  it("asks which Save, pins a unique target to the read, and re-reads after the page moves on", async () => {
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
    const reads = () => sendMessage.mock.calls.filter(([, msg]) => msg.kind === "read_page").length;
    const readsBefore = reads();
    const after = await call("after", "highlight", { text: "Database ID" });
    // The changed screen is read again on its own, then the same control is pointed at.
    expect(reads()).toBe(readsBefore + 1);
    expect(after).toMatchObject({ found: true, name: "Database ID" });
    expect(logText()).not.toContain("This screen changed since I last read it");
    expect(highlights()).toHaveLength(2);
  });

  it("re-reads once when the page reports a stale target, then gives up clearly", async () => {
    await call("read", "read_page", {});
    sendMessage.mockImplementation(async (_tab: number, msg: { kind: string }) =>
      msg.kind === "read_page" ? snapshot : msg.kind === "highlight" ? { found: false, reason: "stale", alternatives: [] } : { ok: true });
    const result = await call("gone", "highlight", { text: "Database ID" });
    expect(result).toMatchObject({ found: false, reason: "stale" });
    expect(highlights()).toHaveLength(2);
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

describe("large real page read", () => {
  beforeEach(async () => {
    const links = (count: number, label: string) => Array.from({ length: count }, (_, k) => `<a href="/p${k}">${label} ${k + 1} product page</a>`).join("");
    document.body.insertAdjacentHTML("beforeend", `<div id="console">
      <header><a href="/">Google Cloud</a><input aria-label="Search (/) for resources, docs, products, and more"><button>Select a project</button>${links(10, "Header shortcut")}</header>
      <nav aria-label="Product navigation">${links(60, "Product navigation")}</nav>
      <div role="menu">${links(90, "Left menu")}</div>
      <form aria-label="Create service">
        <fieldset><legend>Container</legend><label>Container image URL<input name="image"></label><label>Container port<input name="port"></label></fieldset>
        <section aria-label="Labels"><h2>Labels</h2><label>Key 1<input name="k1"></label><label>Value 1<input name="v1"></label><button type="button">Add label</button></section>
        <button>Create</button>
      </form></div>`);
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
    const content = chrome.runtime.onMessage.addListener.mock.calls[1][0];
    sendMessage.mockImplementation((_tab: number, msg: unknown) => new Promise((resolve) => content(msg, {}, resolve)));
  });

  afterEach(() => { (globalThis as any).chrome.runtime.id = ""; });

  it("sends a 150-control console read within the relay's per-result allowance, keeping the form, and keeps answering tools", async () => {
    const socket = await connected();
    socket.receive({ type: "tool_call", id: "function-call-read-1", name: "read_page", args: {} });
    let raw = "";
    await vi.waitFor(() => {
      raw = socket.send.mock.calls.map(([frame]) => frame as string).find((frame) => JSON.parse(frame).id === "function-call-read-1")!;
      expect(raw).toBeDefined();
    });
    const result = JSON.parse(raw);
    expect(result.id.length + result.name.length + JSON.stringify(result.response).length).toBeLessThanOrEqual(4000);
    expect(result.response.truncated).toMatchObject({ total: 150 });
    expect(result.response.elements.length).toBeGreaterThan(20);
    expect(result.response.elements.length).toBe(result.response.truncated.shown);
    expect(result.response).not.toHaveProperty("rank");
    const names = result.response.elements.map((e: { name: string }) => e.name);
    expect(names).toEqual(expect.arrayContaining(["Container image URL", "Container port", "Key 1", "Value 1", "Add label", "Create"]));
    expect(names.filter((n: string) => n.startsWith("Left menu")).length).toBeLessThan(90);

    socket.receive({ type: "tool_call", id: "function-call-point-1", name: "highlight", args: { text: "Key 1", section: "Labels" } });
    await vi.waitFor(() => expect(sent(socket)).toContainEqual(expect.objectContaining({ type: "tool_result", id: "function-call-point-1", response: expect.objectContaining({ found: true, name: "Key 1" }) })));
    expect(socket.close).not.toHaveBeenCalled();
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
    expect(messages[0].text).toContain('Page event: User clicked "Create" with no rule Violations.');
    expect(messages[0].text).toContain("Page event: Labels section opened");
    expect(messages[0].text).not.toContain("what next?");
    expect(messages[1]).toEqual({ type: "text", text: "what next?" });
  });

  it("remembers delivered input but excludes failed undelivered text from reconnect history", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    type("first try");
    await vi.waitFor(() => expect(status()).toBe("Can't connect to coach.example. Type or tap the mic to retry"));
    type("second try");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    sockets[0].closed(1005);
    type("third try");
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].receive({ type: "ready" });
    const [summary] = sent(sockets[1]);
    expect(summary.text).not.toContain("first try");
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

  it("sends create-form values for Goal and Playbook checks even when deterministic Rules pass", async () => {
    const socket = await connected();
    page({ kind: "submit_intent", label: "Create", form: { ...form, fields: { Region: "us-central1", Description: "", "Service name": "invoices" } } });
    await vi.waitFor(() => expect(sent(socket)).toEqual([{
      type: "event",
      text: expect.stringContaining('User clicked "Create" with no rule Violations. Form: Region=us-central1, Service name=invoices.'),
    }]));
    expect(sent(socket)[0].text).toContain("Compare it with the Goal and the playbook");
  });

  it("keeps warning counts in submit context when no Rule blocks", async () => {
    const socket = await connected();
    policy.violations = [{ ruleId: "name", field: "Service name", message: "Check the service name.", severity: "warn" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sent(socket)[0]?.text).toContain("1 to check (1 Rule)"));
    expect(sent(socket)[0].text).not.toContain("no rule Violations");
  });

  it("reconnects for a blocking submit warning and delivers it once ready", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form: { ...form, fields: { Region: "us-central1" } } });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "ready" });
    expect(sent(sockets[0])).toEqual([{ type: "event", text: expect.stringContaining("1 to fix (1 Rule) remain: Add an owner label. Form: Region=us-central1") }]);
    expect(document.querySelector('#log [role="alert"]')).toBeNull();
  });

  it("shows a blocking submit warning prominently when the daily allowance is used", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].receive({ type: "error", message: "Today's demo voice allowance is used." });
    sockets[0].closed(4000);
    expect(document.querySelector('#log [role="alert"]')?.textContent).toContain("Add an owner label.");
  });

  it("shows a blocking submit warning prominently when session admission fails", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "The coach is busy." }) }));
    policy.violations = [{ ruleId: "owner", field: "Labels", message: "Add an owner label.", severity: "block" }];
    page({ kind: "submit_intent", label: "Create", form });
    await vi.waitFor(() => expect(document.querySelector('#log [role="alert"]')?.textContent).toContain("Add an owner label."));
    expect(sockets).toHaveLength(0);
  });

  it("does not connect for a passing submit while disconnected", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    page({ kind: "submit_intent", label: "Create", form });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sessionRequests()).toBe(0);
  });
});

describe("demo sign-in", () => {
  let authStore: Record<string, unknown>;
  const judge = { email: "judge@example.com", idToken: "id-1", refreshToken: "refresh-1" };
  const signInRequests = () => fetchMock.mock.calls.filter(([url]) => url.includes("accounts:signInWithPassword"));

  async function openPanel(signedIn: boolean) {
    vi.resetModules();
    config.firebaseKey = "test-key";
    authStore = signedIn ? { guiderailAuth: { ...judge, expiresAt: Date.now() + 3_600_000 } } : {};
    (chrome.storage as { session: unknown }).session = {
      get: vi.fn(async (key: string) => (key in authStore ? { [key]: authStore[key] } : {})),
      set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(authStore, value); }),
      remove: vi.fn(async (key: string) => { delete authStore[key]; }),
    };
    document.body.innerHTML = panelHtml();
    await import("./sidepanel.ts");
    await vi.waitFor(() => expect($(signedIn ? "#account" : "#signin").hidden).toBe(false));
  }

  afterEach(() => { config.firebaseKey = ""; });

  it("asks for a sign-in before Talk, Send or Teach can be used", async () => {
    await openPanel(false);
    expect($("#signin").textContent).toContain("Use the demo login from the pitch deck.");
    expect(document.activeElement).toBe($("#signin-email"));
    for (const sel of ["#talk", "#text", "#form button[type=submit]", "#teach"]) expect($<HTMLButtonElement>(sel).disabled).toBe(true);
    expect(document.body.hasAttribute("data-signed-out")).toBe(true);
    $<HTMLFormElement>("#form").dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sessionRequests()).toBe(0);
    expect(sockets).toHaveLength(0);
  });

  it("shows a plain message for a wrong password and keeps the form", async () => {
    await openPanel(false);
    fetchMock.mockImplementation(async (url: string) => url.includes("signInWithPassword")
      ? new Response(JSON.stringify({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }), { status: 400 })
      : defaultFetch(url));
    $<HTMLInputElement>("#signin-email").value = "judge@example.com";
    $<HTMLInputElement>("#signin-password").value = "wrong";
    $<HTMLFormElement>("#signin-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect($("#signin-error").textContent).toBe("Wrong email or password."));
    expect($("#signin").hidden).toBe(false);
    expect($<HTMLButtonElement>("#signin-submit").disabled).toBe(false);
    expect(authStore).toEqual({});
  });

  it("signs in, then sends the Bearer token with the session request", async () => {
    await openPanel(false);
    let finish!: () => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("signInWithPassword")) {
        await new Promise<void>((resolve) => { finish = resolve; });
        return new Response(JSON.stringify({ ...judge, expiresIn: "3600", localId: "u1" })) as never;
      }
      return defaultFetch(url);
    });
    $<HTMLInputElement>("#signin-email").value = "judge@example.com";
    $<HTMLInputElement>("#signin-password").value = "demo-pass";
    $<HTMLFormElement>("#signin-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(signInRequests()).toHaveLength(1));
    expect($<HTMLButtonElement>("#signin-submit").disabled).toBe(true);
    finish();
    await vi.waitFor(() => expect($("#signin").hidden).toBe(true));
    expect($("#account-email").textContent).toBe("judge@example.com");
    expect(document.activeElement).toBe($("#text"));
    expect($<HTMLButtonElement>("#talk").disabled).toBe(false);
    expect(JSON.stringify(authStore)).not.toContain("demo-pass");
    type("hello");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const [, init] = fetchMock.mock.calls.find(([url]) => url.endsWith("/session")) as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer id-1");
  });

  it("goes straight to the panel with a stored session and shows the form again after a 401", async () => {
    await openPanel(true);
    expect($("#signin").hidden).toBe(true);
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/session")
      ? new Response(JSON.stringify({ error: "sign_in_required" }), { status: 401 }) as never
      : defaultFetch(url));
    type("hello");
    await vi.waitFor(() => expect($("#signin").hidden).toBe(false));
    expect($("#signin-error").textContent).toBe("Your sign-in expired. Please sign in again.");
    expect(authStore).toEqual({});
    expect(sockets).toHaveLength(0);
    expect($<HTMLButtonElement>("#talk").disabled).toBe(true);
    expect(document.activeElement).toBe($("#signin-email"));
  });

  it("keeps the form visible with a clear message for a disallowed account", async () => {
    await openPanel(true);
    fetchMock.mockImplementation(async (url: string) => url.endsWith("/session")
      ? new Response(JSON.stringify({ error: "not_allowed" }), { status: 403 }) as never
      : defaultFetch(url));
    type("hello");
    await vi.waitFor(() => expect($("#signin-error").textContent).toBe("This account isn't allowed to use this GuideRail demo."));
    expect($("#signin").hidden).toBe(false);
  });

  it("signs out: closes the live connection, clears the session and shows the form", async () => {
    await openPanel(true);
    const socket = await connected();
    $<HTMLButtonElement>("#signout").click();
    await vi.waitFor(() => expect($("#signin").hidden).toBe(false));
    expect(socket.close).toHaveBeenCalled();
    expect(authStore).toEqual({});
    expect($("#account").hidden).toBe(true);
    expect($<HTMLButtonElement>("#talk").disabled).toBe(true);
    expect(status()).toBe("Sign in to use GuideRail");
  });
});

describe("Firestore Guard panel", () => {
  const firestoreTest = { ...form, url: "console.firebase.google.com/project/practice-only/firestore", fields: { "Start in test mode": "checked", "Start in Production mode": "" } };
  function delayedReads() {
    const reads: ((value: unknown) => void)[] = [];
    sendMessage.mockImplementation((_tab: number, msg: { kind: string }) => msg.kind === "read_form" ? new Promise((resolve) => { reads.push(resolve); }) : Promise.resolve({ shown: [] }));
    const shows = () => sendMessage.mock.calls.filter(([, msg]) => msg.kind === "show_violations");
    return { reads, shows };
  }
  it("ignores a read from tab A that resolves after tab B, without sending stale Violations or reviving the Firestore card", async () => {
    policy.violations = [{ ruleId: "firestore-no-test-mode", field: "Start in test mode", severity: "block", message: "Test mode allows anyone to read and overwrite your data." }];
    const { reads, shows } = delayedReads();
    page({ kind: "tab_changed", tabId: 1, url: "https://console.firebase.google.com/project/practice-only/firestore" });
    await vi.waitFor(() => expect(reads).toHaveLength(1));
    page({ kind: "tab_changed", tabId: 2, url: "https://example.com/" });
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    reads[1](form);
    await vi.waitFor(() => expect(shows()).toHaveLength(1));
    reads[0](firestoreTest);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(shows()).toHaveLength(1);
    expect($("#firestore-guidance").hidden).toBe(true);
  });
  it("does not revive Firestore guidance from a policy read that began before a tab change", async () => {
    const socket = await connected();
    const { reads, shows } = delayedReads();
    socket.receive({ type: "tool_call", id: "check", name: "check_policy", args: {} });
    await vi.waitFor(() => expect(reads).toHaveLength(1));
    page({ kind: "tab_changed", tabId: 2 });
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    reads[0](firestoreTest);
    await vi.waitFor(() => expect(sent(socket).some((m) => m.id === "check")).toBe(true));
    expect(shows()).toHaveLength(0);
    expect($("#firestore-guidance").hidden).toBe(true);
  });
  it("does not show Violations or the Firestore card from a policy read that resolves after Teach starts", async () => {
    policy.violations = [{ ruleId: "firestore-no-test-mode", field: "Start in test mode", severity: "block", message: "Test mode allows anyone to read and overwrite your data." }];
    const socket = await connected();
    const { reads, shows } = delayedReads();
    socket.receive({ type: "tool_call", id: "check", name: "check_policy", args: {} });
    await vi.waitFor(() => expect(reads).toHaveLength(1));
    $<HTMLButtonElement>("#teach").click();
    await vi.waitFor(() => expect(shows()).toHaveLength(1));
    reads[0](firestoreTest);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(shows().map(([, msg]) => msg.violations)).toEqual([[]]);
    expect($("#firestore-guidance").hidden).toBe(true);
    expect($("#issues").hidden).toBe(true);
  });
  it("renders the block reason, safe choice and location source, then clears on Production", async () => {
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    const firestore = { ...form, url: "console.firebase.google.com/project/practice-only/firestore", fields: { "Start in test mode": "checked", "Start in Production mode": "" } };
    policy.violations = [{ ruleId: "firestore-no-test-mode", field: "Start in test mode", severity: "block", message: "Test mode allows anyone to read and overwrite your data. Choose Start in Production mode before Create." }];
    sendMessage.mockResolvedValue({ shown: ["Start in test mode"] });
    page({ kind: "form_changed", form: firestore });
    await vi.waitFor(() => expect($("#issues").hidden).toBe(false));
    expect($("#issues-list li").dataset.severity).toBe("block");
    expect($("#issues-list").textContent).toContain("allows anyone to read and overwrite your data");
    expect($("#issues-list").textContent).toContain("Start in Production mode");
    expect($("#firestore-guidance").textContent).toContain("location cannot be changed after creation");
    $("#issues-list button").click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "show_field", field: "Start in test mode" }));
    policy.violations = [];
    page({ kind: "form_changed", form: { ...firestore, fields: { "Start in test mode": "", "Start in Production mode": "checked" } } });
    await vi.waitFor(() => expect($("#issues").hidden).toBe(true));
    expect($("#firestore-guidance").textContent).toContain("Production mode is selected");
    page({ kind: "form_changed", form: { ...firestore, fields: {}, sections: ["Create a database"] } });
    await vi.waitFor(() => expect($("#firestore-guidance").textContent).toContain("Security mode not checked"));
    page({ kind: "form_changed", form: { ...firestore, fields: {} } });
    await vi.waitFor(() => expect($("#firestore-guidance").hidden).toBe(true));
    page({ kind: "form_changed", form: { ...firestore, fields: {}, sections: ["Create a database"] } });
    await vi.waitFor(() => expect($("#firestore-guidance").hidden).toBe(false));
    page({ kind: "form_changed", form });
    await vi.waitFor(() => expect($("#firestore-guidance").hidden).toBe(true));
  });
});
