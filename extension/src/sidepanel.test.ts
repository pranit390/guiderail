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
  close = vi.fn();
  constructor() { sockets.push(this); }
}
let sockets: Socket[];
const sendMessage = vi.fn().mockResolvedValue({ ok: true });

beforeEach(async () => {
  vi.resetModules();
  sockets = [];
  sendMessage.mockClear();
  document.body.innerHTML = readFileSync("public/sidepanel.html", "utf8")
    .replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ rules: [] }) }));
  vi.stubGlobal("chrome", {
    identity: { AccountStatus: { ANY: "ANY" }, getProfileUserInfo: vi.fn().mockResolvedValue({}) },
    runtime: { onMessage: { addListener: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), sendMessage },
  });
  await import("./sidepanel.ts");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
});

afterEach(() => vi.unstubAllGlobals());

describe("Teach controls in a long conversation", () => {
  it("reveals recording controls when Teach starts from history", async () => {
    const log = document.querySelector<HTMLElement>("#log")!;
    const scroll = document.querySelector<HTMLElement>("#scroll")!;
    const bar = document.querySelector<HTMLElement>("#teachbar")!;
    log.textContent = "A long conversation. ".repeat(1000);
    scroll.scrollTop = 0;
    bar.scrollIntoView = vi.fn(() => { scroll.scrollTop = 9000; });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.querySelector<HTMLButtonElement>("#teach")!.click();
    await vi.waitFor(() => expect(bar.hidden).toBe(false));
    expect(bar.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scroll.scrollTop).toBe(9000);
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
