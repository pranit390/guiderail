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
const session = { set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };

beforeEach(async () => {
  vi.resetModules();
  sockets = [];
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  queryTabs.mockReset().mockResolvedValue([{ id: 1 }]);
  storageSet.mockClear();
  Object.values(audio).forEach((mock) => mock.mockClear());
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ rules: [] }) }));
  vi.stubGlobal("chrome", {
    storage: { local: { get:vi.fn().mockImplementation(async () => ({ voiceOut:savedVoice })), set:storageSet }, session },
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() } },
    tabs: { query: queryTabs, get: vi.fn().mockResolvedValue({ id: 1 }), sendMessage },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
});

afterEach(() => vi.unstubAllGlobals());

describe("calmer panel paths", () => {
  it("announces Journey changes through one conversation live region", () => {
    const status = document.querySelector("[data-status]")!;
    expect(status.closest('[aria-live="polite"]')?.id).toBe("log");
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
