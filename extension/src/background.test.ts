import { afterEach, beforeEach, expect, it, vi } from "vitest";

const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
const installed = vi.fn();
const create = vi.fn();
const sendMessage = vi.fn().mockResolvedValue(undefined);
const command = vi.fn();

async function loadBackground() {
  vi.resetModules();
  await import("./background.ts");
}

beforeEach(() => {
  vi.clearAllMocks();
  setPanelBehavior.mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    sidePanel: { setPanelBehavior },
    runtime: {
      onInstalled: { addListener: installed },
      getURL: (path: string) => `chrome-extension://test/${path}`, sendMessage,
    },
    tabs: { create, onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: command } },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("configures the toolbar once at worker evaluation and opens the welcome page only on install", async () => {
  await loadBackground();
  expect(setPanelBehavior).toHaveBeenCalledExactlyOnceWith({ openPanelOnActionClick: true });
  const onInstalled = installed.mock.calls[0][0];
  onInstalled({ reason: "install" });
  expect(create).toHaveBeenCalledExactlyOnceWith({ url: "chrome-extension://test/welcome.html" });
  onInstalled({ reason: "update" });
  expect(setPanelBehavior).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
});

it("contains setup rejection and still registers lifecycle listeners", async () => {
  const error = new Error("API unavailable");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  setPanelBehavior.mockRejectedValueOnce(error);
  await loadBackground();
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Could not configure GuideRail's toolbar action", error));
  expect(installed).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

it("preserves the voice command and ignores unrecognized commands", async () => {
  await loadBackground();
  const onCommand = command.mock.calls[0][0];
  onCommand("toggle-voice");
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ kind: "toggle_voice" });
  onCommand("unknown");
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
