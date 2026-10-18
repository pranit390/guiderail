// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDraft } from "../../server/src/journeys/fixture.ts";
import { FIRESTORE_GOAL } from "../../shared/journey.ts";
import { PUBLIC_DOCS } from "./document.ts";

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
  onclose: (() => void) | undefined;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor(public url: string) { sockets.push(this); }
  get params() { return new URL(this.url).searchParams; }

}
let sockets: Socket[];
const sendMessage = vi.fn().mockResolvedValue({ ok: true });
const queryTabs = vi.fn();
const getTab = vi.fn();
const session = { set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  sockets = [];
  storageSet.mockClear();
  Object.values(audio).forEach((mock) => mock.mockClear());
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  getTab.mockReset().mockResolvedValue({ id: 1 });
  queryTabs.mockReset().mockResolvedValue([{ id: 1 }]);
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ rules: [] }) }));
  vi.stubGlobal("chrome", {
    storage: { local: { get:vi.fn().mockImplementation(async () => ({ voiceOut:savedVoice })), set:storageSet }, session },
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() } },
    tabs: { query: queryTabs, get: getTab, sendMessage },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
});

afterEach(() => vi.unstubAllGlobals());

describe("Teach controls in a long conversation", () => {
  it("keeps a reader in history where they are and offers the recording controls through the chip", async () => {
    const log = document.querySelector<HTMLElement>("#log")!;
    const scroll = document.querySelector<HTMLElement>("#scroll")!;
    const bar = document.querySelector<HTMLElement>("#teachbar")!;
    const chip = document.querySelector<HTMLButtonElement>("#newcards")!;
    log.textContent = "A long conversation. ".repeat(1000);
    log.getBoundingClientRect = () => ({ top: -scroll.scrollTop, bottom: 9000 - scroll.scrollTop }) as DOMRect;
    scroll.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect;
    bar.getBoundingClientRect = () => ({ top: 9000 - scroll.scrollTop, bottom: 9100 - scroll.scrollTop }) as DOMRect;
    scroll.scrollTop = 0;
    bar.scrollIntoView = vi.fn(() => { scroll.scrollTop = 9000; });
    document.querySelector<HTMLButtonElement>("#teach")!.click();
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    expect(bar.scrollIntoView).not.toHaveBeenCalled();
    expect(scroll.scrollTop).toBe(0);
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("New: Teach controls");
    chip.click();
    expect(bar.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(chip.hidden).toBe(true);
    expect(document.querySelector("#teachstop")?.textContent).toContain("Stop and draft Playbook");
  });

  it.each(["network", "http", "json"])("reveals retry controls after a %s drafting failure", async (failure) => {
    const bar = document.querySelector<HTMLElement>("#teachbar")!;
    bar.scrollIntoView = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.querySelector<HTMLButtonElement>("#teach")!.click();
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    vi.mocked(bar.scrollIntoView).mockClear();
    if (failure === "network") vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    else vi.mocked(fetch).mockResolvedValue({
      ok: failure !== "http",
      statusText: "bad response",
      json: failure === "json" ? async () => { throw new Error("invalid JSON"); } : async () => ({ error: "try again" }),
    } as Response);
    document.querySelector<HTMLButtonElement>("#teachstop")!.click();
    await vi.waitFor(() => expect(bar.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(bar.hidden).toBe(false);
  });
});

describe("calmer panel paths", () => {
  it("announces Journey changes through one conversation live region and keeps the current Step outside it", () => {
    const status = document.querySelector("[data-status]")!;
    expect(status.closest('[aria-live="polite"]')?.id).toBe("log");
    expect(document.querySelector("#current-step")!.closest("#log")).toBeNull();
    expect(document.querySelector("#journey [aria-live], #journey [role=status]")).toBeNull();
  });
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

describe("public docs briefing", () => {
  it.each([true, false])("points to IAM's grant heading and reports highlight found=%s honestly", async (found) => {
    queryTabs.mockResolvedValue([{ id: 1, url: PUBLIC_DOCS[1] }]);
    const doc = { url: PUBLIC_DOCS[1], title: "Grant IAM access", text: "Grant a single IAM role to a principal.", headings: ["Before you begin", "Grant a single IAM role"] };
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_document" ? doc : { found });
    await sockets[0].onmessage?.({ data: JSON.stringify({ type: "ready" }) });
    document.querySelector<HTMLButtonElement>("[data-brief]")!.click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, { kind: "highlight_document", heading: "Grant a single IAM role" }));
    const status = document.querySelector("[data-status]")!;
    if (found) {
      await vi.waitFor(() => expect(status.textContent).toContain("Briefing requested"));
      expect(sockets[0].send).toHaveBeenCalledWith(expect.stringContaining("Brief me from this page using only"));
    } else {
      await vi.waitFor(() => expect(status.textContent).toContain("Couldn't point to “Grant a single IAM role”"));
      expect(status.textContent).not.toContain("Briefing requested");
      expect(sockets[0].send).not.toHaveBeenCalled();
    }
  });
});

describe("compile during Teach", () => {
  it("leaves Teach connected and starts Guide fresh with the compiled Goal", async () => {
    const compiled = { cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 100, compiledAt: "2026-10-17T23:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } };
    let respond!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url) => String(url).endsWith("/journeys/compile")
      ? new Promise<Response>((resolve) => { respond = resolve; })
      : new Response(JSON.stringify({ error: "offline" }), { status: 503 }));
    await sockets[0].onmessage?.({ data: JSON.stringify({ type: "resumption", handle: "pre-compile" }) });
    expect(session.set).toHaveBeenCalledWith({ resumeHandle: "pre-compile" });

    document.querySelector<HTMLButtonElement>("[data-compile]")!.click();
    document.querySelector<HTMLButtonElement>("#teach")!.click();
    await vi.waitFor(() => expect(sockets.at(-1)!.params.get("mode")).toBe("teach"));
    const teach = sockets.at(-1)!;

    respond(new Response(JSON.stringify(compiled)));
    await vi.waitFor(() => expect(document.querySelector("[data-status]")!.textContent).toContain("from cache"));
    expect(sockets.at(-1)).toBe(teach);
    expect(teach.close).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("#teachstop")!.click();
    await vi.waitFor(() => expect(sockets.at(-1)!.params.get("mode")).toBe("guide"));
    expect(sockets.at(-1)!.params.get("goalId")).toBe(FIRESTORE_GOAL.id);
    expect(sockets.at(-1)!.params.has("resume")).toBe(false);
  });
});

describe("bound Journey tool and event routing", () => {
  const boundUrl = "https://console.firebase.google.com/project/zoop-innovation/firestore/databases";
  async function start() {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 1, compiledAt: "2026-10-18T00:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } })));
    chrome.tabs.create = vi.fn().mockResolvedValue({ id: 7, url: FIRESTORE_GOAL.consoleUrl });
    getTab.mockResolvedValue({ id: 7, url: boundUrl });
    queryTabs.mockResolvedValue([{ id: 7, url: boundUrl }]);
    document.querySelector<HTMLButtonElement>("[data-open]")!.click();
    await vi.waitFor(() => expect(document.querySelectorAll("#journey li")).toHaveLength(10));
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
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 1, compiledAt: "2026-10-18T00:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } })));
    chrome.tabs.create = vi.fn().mockResolvedValue({ id: 7, url: FIRESTORE_GOAL.consoleUrl });
    const issuing = sockets[0];
    expect(await tool("open_page", { goalId: FIRESTORE_GOAL.id })).toMatchObject({ opened: true, goalId: FIRESTORE_GOAL.id });
    expect(sockets).toHaveLength(1); expect(issuing.close).not.toHaveBeenCalled();
    receive({ type: "resumption", handle: "pre-goal" });
    receive({ type: "turn_complete" });
    expect(issuing.close).toHaveBeenCalled(); expect(sockets).toHaveLength(2);
    expect(sockets[1].params.get("goalId")).toBe(FIRESTORE_GOAL.id); expect(sockets[1].params.has("resume")).toBe(false);
  });
  it("keeps the person's Next after they click the pointed control, but pauses on tab switch or unsupported navigation", async () => {
    await start(); const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: [{ i: 1, role: "button", name: "Databases & Storage" }] }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    const [reread, next] = document.querySelectorAll<HTMLButtonElement>("#current-step button");
    const point = async () => { reread.click(); await vi.waitFor(() => expect(next.disabled).toBe(false)); };
    const sender = { tab: { id: 7 }, url: boundUrl } as chrome.runtime.MessageSender;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    await point();
    listener({ kind: "page_event", text: 'User clicked "Databases & Storage".' }, sender, vi.fn()); await settle();
    listener({ kind: "page_event", text: "Page changed.", generation: 3 }, sender, vi.fn());
    listener({ kind: "tab_changed", tabId: 7, url: boundUrl }, {}, vi.fn()); await settle();
    expect(next.disabled).toBe(false);
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 3, elements: [{ i: 1, role: "radio", name: "Standard edition" }] } : { ok: true });
    sendMessage.mockClear();
    reread.click(); await vi.waitFor(() => expect(document.querySelector("#journey [aria-current=step] p:last-child")!.textContent).toContain("I can't see it on this screen"));
    expect(sendMessage.mock.calls.some(([, message]) => message.kind === "highlight")).toBe(false);
    expect(next.disabled).toBe(false);
    listener({ kind: "tab_changed", tabId: 8 }, {}, vi.fn()); expect(next.disabled).toBe(true);
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: [{ i: 1, role: "button", name: "Databases & Storage" }] }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    await point();
    listener({ kind: "page_event", text: 'User clicked "Databases & Storage".' }, sender, vi.fn()); await settle();
    listener({ kind: "page_event", text: "Page changed.", generation: 4 }, { tab: { id: 7 }, url: "https://accounts.google.com/signin" } as chrome.runtime.MessageSender, vi.fn());
    expect(next.disabled).toBe(true);
  });
  it("accepts the bound tab's click after an in-page route change leaves the sender URL stale", async () => {
    await start(); const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 2, elements: [{ i: 1, role: "button", name: "Databases & Storage" }] }
      : message.kind === "highlight" ? { found: true, i: message.index, name: message.name, confidence: 1 } : { ok: true });
    const [reread, next] = document.querySelectorAll<HTMLButtonElement>("#current-step button");
    reread.click(); await vi.waitFor(() => expect(next.disabled).toBe(false));
    const socket = sockets.at(-1)!; socket.send.mockClear();
    const stale = { tab: { id: 7 }, url: FIRESTORE_GOAL.consoleUrl } as chrome.runtime.MessageSender;
    listener({ kind: "page_event", text: 'User clicked "Databases & Storage".' }, stale, vi.fn());
    await vi.waitFor(() => expect(document.querySelector("#journey [aria-current=step] p:last-child")!.textContent).toContain("You clicked the highlighted control"));
    expect(next.disabled).toBe(false);
    expect(socket.send.mock.calls.some(([payload]) => JSON.parse(payload).type === "event")).toBe(true);
    sendMessage.mockImplementation(async (_id, message) => message.kind === "read_page"
      ? { url: boundUrl, title: "Firestore", generation: 3, elements: [{ i: 1, role: "radio", name: "Standard edition" }] } : { ok: true });
    reread.click(); await vi.waitFor(() => expect(document.querySelector("#journey [aria-current=step] p:last-child")!.textContent).toContain("I can't see it on this screen"));
    expect(next.disabled).toBe(false);
    getTab.mockResolvedValue({ id: 7, url: "https://console.firebase.google.com/project/other-proj/firestore/databases" });
    listener({ kind: "page_event", text: 'User clicked "Databases & Storage".' }, stale, vi.fn());
    await vi.waitFor(() => expect(next.disabled).toBe(true));
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
