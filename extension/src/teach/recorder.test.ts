// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeachEvent } from "./events.ts";
import { startRecording, stopRecording } from "./recorder.ts";

let events: TeachEvent[];

beforeEach(() => {
  document.body.innerHTML = `
    <button>Create service</button>
    <label for="svc">Service name</label><input id="svc">
    <label for="tok">Token</label><input id="tok">
    <input type="password" id="pw" aria-label="Password">
    <label for="key">API key</label><input id="key">
    <section aria-label="Variables &amp; Secrets"><label for="val">Value 1</label><input id="val"></section>
    <guiderail-overlay><button id="ours">Copy</button></guiderail-overlay>`;
  events = [];
  startRecording((e) => events.push(e));
});
afterEach(() => stopRecording());

const change = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("recorder", () => {
  it.each(["Recovery code", "Seed phrase", "recovery phrase", "mnemonic", "Session cookie", "Security answer", "backup code", "authentication code", "wallet phrase"])("masks a short %s secret identified by a secondary label", (label) => {
    const associated = document.createElement("label");
    associated.htmlFor = "private";
    associated.textContent = label;
    const field = document.createElement("input");
    field.id = "private";
    field.setAttribute("aria-label", "Display name");
    document.body.append(associated, field);
    change("private", "AB12-CD34");
    expect(events).toEqual([expect.objectContaining({ t: "field", value: "«masked»" })]);
  });

  it("masks OTP, credential and token-named values through the shared page boundary", () => {
    document.body.insertAdjacentHTML("beforeend", '<input id="otp" aria-label="One-time code"><textarea id="cred" name="credential"></textarea>');
    change("otp", "123456");
    change("cred", "ordinary-looking-secret");
    change("tok", "short-token");
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.t === "field" && event.value === "«masked»")).toBe(true);
  });

  it("records nothing on sensitive account origins", () => {
    vi.stubGlobal("location", new URL("https://accounts.google.com/signin"));
    try {
      startRecording((event) => events.push(event));
      document.querySelector("button")!.click();
      change("svc", "must-not-leave-browser");
      expect(events).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("records a click with the element's meaning", () => {
    document.querySelector("button")!.click();
    expect(events[0]).toMatchObject({ t: "click", target: { role: "button", name: "Create service" } });
  });
  it("records field changes by label", () => {
    change("svc", "ocr-service");
    expect(events[0]).toMatchObject({ t: "field", target: { name: "Service name" }, value: "ocr-service" });
  });
  it.each(["radio", "checkbox"])("records a native %s using the guard's checked value", (type) => {
    const field = document.createElement("input");
    field.type = type;
    field.setAttribute("aria-label", "Allow unauthenticated");
    field.value = "on";
    document.body.append(field);
    field.checked = true;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.checked = false;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events).toEqual([
      expect.objectContaining({ t: "field", target: expect.objectContaining({ name: "Allow unauthenticated" }), value: "checked" }),
      expect.objectContaining({ t: "field", value: "" }),
    ]);
  });

  it("masks secret-looking values", () => {
    change("tok", "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345");
    expect(events[0]).toMatchObject({ t: "field", value: "«masked»" });
  });
  it("masks any value typed into a secret-named field", () => {
    change("key", "hello");
    expect(events[0]).toMatchObject({ t: "field", target: { name: "API key" }, value: "«masked»" });
  });
  it("masks any value in the Variables & Secrets section", () => {
    change("val", "plain-looking");
    expect(events[0]).toMatchObject({ t: "field", value: "«masked»" });
  });
  it("never records password fields", () => {
    change("pw", "hunter2");
    expect(events).toHaveLength(0);
  });
  it("ignores clicks on GuideRail's own overlay", () => {
    document.getElementById("ours")!.click();
    expect(events).toHaveLength(0);
  });
  it("stops recording", () => {
    stopRecording();
    document.querySelector("button")!.click();
    expect(events).toHaveLength(0);
  });
  it("does not leave navigation timers when recording starts twice", () => {
    stopRecording();
    vi.useFakeTimers();
    try {
      startRecording((e) => events.push(e));
      startRecording((e) => events.push(e));
      stopRecording();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records picking from a custom dropdown as a choice on that field", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <span id="rl">Region</span>
      <div role="combobox" aria-labelledby="rl" aria-controls="lb" tabindex="0">us-central1</div>
      <div role="listbox" id="lb"><div role="option">europe-west1 (Belgium)</div></div>`);
    events.length = 0;
    (document.querySelector('[role=option]') as HTMLElement).click();
    expect(events).toEqual([expect.objectContaining({ t: "field", target: expect.objectContaining({ name: "Region" }), value: "europe-west1 (Belgium)" })]);
  });

  it("links an option to the dropdown opened last when the list isn't linked", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <button aria-haspopup="listbox" aria-label="Authentication">Require authentication</button>
      <ul role="listbox"><li role="option">Allow public access</li></ul>`);
    (document.querySelector('[aria-haspopup]') as HTMLElement).click();
    events.length = 0;
    (document.querySelector('[role=listbox] li') as HTMLElement).click();
    expect(events).toEqual([expect.objectContaining({ t: "field", target: expect.objectContaining({ name: "Authentication" }), value: "Allow public access" })]);
  });

  it("records a custom toggle's new state", async () => {
    document.body.insertAdjacentHTML("beforeend", `<div role="switch" aria-label="Allow unauthenticated" aria-checked="false"></div>`);
    const sw = document.querySelector('[role=switch]') as HTMLElement;
    sw.addEventListener("click", () => sw.setAttribute("aria-checked", "true"));
    events.length = 0;
    sw.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([expect.objectContaining({ t: "field", target: expect.objectContaining({ name: "Allow unauthenticated" }), value: "checked" })]);
  });
});
