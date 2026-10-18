// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const html = readFileSync("public/welcome.html", "utf8");
const open = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn();
const getCurrent = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });

function element<T extends HTMLElement>(selector: string) {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
async function load() {
  await import("./welcome.ts");
  await vi.waitFor(() => expect(element<HTMLButtonElement>("#open").disabled).toBe(false));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(window, "addEventListener");
  const body = html.split("<body>")[1]?.split("</body>")[0];
  if (!body) throw new Error("Welcome page has no body");
  document.body.innerHTML = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  getCurrent.mockResolvedValue({ id: 42 });
  getAll.mockResolvedValue([{ name: "_execute_action", shortcut: "⇧⌘K" }]);
  open.mockResolvedValue(undefined);
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { windows: { getCurrent }, commands: { getAll }, sidePanel: { open } });
  vi.stubGlobal("navigator", { clipboard: { writeText }, mediaDevices: { getUserMedia } });
});
afterEach(() => {
  for (const [type, listener, options] of vi.mocked(window.addEventListener).mock.calls) {
    window.removeEventListener(type, listener, options);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens this window directly on click, without requiring the microphone or shortcut", async () => {
  await load();
  expect(open).not.toHaveBeenCalled();
  element<HTMLButtonElement>("#open").click();
  // The API call must happen synchronously, before the click's user gesture can expire.
  expect(open).toHaveBeenCalledWith({ windowId: 42 });
  expect(getUserMedia).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(element("#open-result").textContent).toContain("GuideRail is open"));
});

it("shows the assigned shortcut rather than assuming the suggested key", async () => {
  getAll.mockResolvedValue([{ name: "_execute_action", shortcut: "Ctrl+Shift+Y" }]);
  await load();
  expect(element("#shortcut").textContent).toBe("Your keyboard shortcut: Ctrl+Shift+Y");
  expect(element("#shortcut-help").hidden).toBe(true);
});

it.each([{ commands: [] }, { commands: [{ name: "_execute_action", shortcut: "" }] }])("explains an unassigned shortcut and copies the settings address: %j", async ({ commands }) => {
  getAll.mockResolvedValue(commands);
  await load();
  expect(element("#shortcut").textContent).toContain("not set");
  expect(element("#shortcut-help").hidden).toBe(false);
  element<HTMLButtonElement>("#copy-shortcuts").click();
  expect(writeText).toHaveBeenCalledWith("chrome://extensions/shortcuts");
  await vi.waitFor(() => expect(element("#copy-result").textContent).toContain("Copied"));
});

it("refreshes the assignment when returning from Chrome settings", async () => {
  await load();
  getAll.mockResolvedValue([{ name: "_execute_action", shortcut: "" }]);
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(element("#shortcut-help").hidden).toBe(false));
});

it("offers a retry when Chrome rejects opening the panel", async () => {
  open.mockRejectedValue(new Error("No user gesture"));
  await load();
  element<HTMLButtonElement>("#open").click();
  await vi.waitFor(() => expect(element("#open-result").textContent).toContain("Try this button again"));
  expect(element<HTMLButtonElement>("#open").disabled).toBe(false);
});

it("still permits microphone setup and stops its temporary stream", async () => {
  await load();
  element<HTMLButtonElement>("#allow").click();
  await vi.waitFor(() => expect(stop).toHaveBeenCalled());
  expect(element("#result").textContent).toContain("Click Open GuideRail");
});

it("shows recoverable errors for shortcut lookup and clipboard failures", async () => {
  getAll.mockRejectedValue(new Error("unavailable"));
  writeText.mockRejectedValue(new Error("denied"));
  await load();
  expect(element("#shortcut").textContent).toContain("Could not read");
  expect(element("#shortcut-help").hidden).toBe(false);
  element<HTMLButtonElement>("#copy-shortcuts").click();
  await vi.waitFor(() => expect(element("#copy-result").textContent).toContain("Could not copy"));
});

it("keeps the opener disabled if Chrome cannot identify its window", async () => {
  getCurrent.mockResolvedValue({});
  await import("./welcome.ts");
  await vi.waitFor(() => expect(element("#open-result").textContent).toContain("Reload this page"));
  expect(element<HTMLButtonElement>("#open").disabled).toBe(true);
  expect(open).not.toHaveBeenCalled();
});
