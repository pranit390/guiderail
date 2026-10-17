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
  it("records a click with the element's meaning", () => {
    document.querySelector("button")!.click();
    expect(events[0]).toMatchObject({ t: "click", target: { role: "button", name: "Create service" } });
  });
  it("records field changes by label", () => {
    change("svc", "ocr-service");
    expect(events[0]).toMatchObject({ t: "field", target: { name: "Service name" }, value: "ocr-service" });
  });
  it("masks secret-looking values", () => {
    change("tok", "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345");
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
    vi.useFakeTimers();
    startRecording((e) => events.push(e));
    startRecording((e) => events.push(e));
    stopRecording();
    window.history.pushState({}, "", "/other");
    vi.advanceTimersByTime(500);
    expect(events).toHaveLength(0);
    vi.useRealTimers();
  });
});
