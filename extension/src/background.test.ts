import { afterEach, beforeEach, expect, it, vi } from "vitest";

const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
const installed = vi.fn();
const startup = vi.fn();
const create = vi.fn();
const sendMessage = vi.fn().mockResolvedValue(undefined);
const command = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setPanelBehavior.mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    sidePanel: { setPanelBehavior },
    runtime: {
      onInstalled: { addListener: installed }, onStartup: { addListener: startup },
      getURL: (path: string) => `chrome-extension://test/${path}`, sendMessage,
    },
    tabs: { create, onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: command } },
  });
  await import("./background.ts");
});
afterEach(() => vi.unstubAllGlobals());

it("configures the toolbar at worker evaluation, install/update, and browser startup", () => {
  expect(setPanelBehavior).toHaveBeenCalledExactlyOnceWith({ openPanelOnActionClick: true });
  const onInstalled = installed.mock.calls[0][0];
  onInstalled({ reason: "install" });
  expect(create).toHaveBeenCalledExactlyOnceWith({ url: "chrome-extension://test/welcome.html" });
  onInstalled({ reason: "update" });
  startup.mock.calls[0][0]();
  expect(setPanelBehavior).toHaveBeenCalledTimes(4);
  expect(create).toHaveBeenCalledTimes(1);
});

it("contains setup rejection and retains future lifecycle listeners", async () => {
  const error = new Error("API unavailable");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  setPanelBehavior.mockRejectedValueOnce(error);
  startup.mock.calls[0][0]();
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Could not configure GuideRail's toolbar action", error));
  log.mockRestore();
});

it("preserves the voice command and ignores unrecognized commands", () => {
  const onCommand = command.mock.calls[0][0];
  onCommand("toggle-voice");
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ kind: "toggle_voice" });
  onCommand("unknown");
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
