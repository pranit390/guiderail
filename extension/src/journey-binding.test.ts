import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyBinding } from "./journey-binding.ts";
import { FIRESTORE_GOAL } from "../../shared/journey.ts";
const url = "https://console.firebase.google.com/project/zoop-innovation/firestore/databases";
const create = vi.fn(); const get = vi.fn(); const query = vi.fn();
beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 7, url: FIRESTORE_GOAL.consoleUrl });
  get.mockReset().mockResolvedValue({ id: 7, url });
  query.mockReset().mockResolvedValue([{ id: 7, url }]);
  vi.stubGlobal("chrome", { tabs: { create, get, query } });
});
afterEach(() => vi.unstubAllGlobals());
describe("catalog-bound Journey", () => {
  it("opens only the catalog URL and reuses its tab", async () => {
    const binding = new JourneyBinding();
    await binding.open({ goalId: FIRESTORE_GOAL.id });
    await binding.open({ goalId: FIRESTORE_GOAL.id });
    expect(create).toHaveBeenCalledExactlyOnceWith({ url: FIRESTORE_GOAL.consoleUrl });
    expect(binding.accepts({ id: 8, url })).toBe(false);
  });
  it.each([{ url }, { goalId: "other" }, { goalId: FIRESTORE_GOAL.id, url }, null])("refuses untrusted destinations %j", async (args) => {
    await expect(new JourneyBinding().open(args)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("pauses on another active tab without rebinding", async () => {
    const binding = new JourneyBinding(); await binding.open({ goalId: FIRESTORE_GOAL.id });
    query.mockResolvedValue([{ id: 8, url }]);
    await expect(binding.tab()).rejects.toThrow("return to the bound");
    expect(binding.tabId).toBe(7);
    query.mockResolvedValue([{ id: 7, url }]);
    await expect(binding.tab()).resolves.toMatchObject({ id: 7 });
  });
  it.each(["https://accounts.google.com/signin", "https://evil.example/", "https://console.firebase.google.com/project/other/firestore/databases", "https://console.firebase.google.com/project/zoop-innovation/settings/general"])('rejects navigation to %s', async (destination) => {
    const binding = new JourneyBinding(); await binding.open({ goalId: FIRESTORE_GOAL.id }); await binding.tab();
    get.mockResolvedValue({ id: 7, url: destination });
    await expect(binding.tab()).rejects.toThrow("Journey paused");
    get.mockResolvedValue({ id: 7, url, pendingUrl: destination });
    await expect(binding.tab()).rejects.toThrow("Journey paused");
  });
  it("keeps a closed tab paused until explicitly ended", async () => {
    const binding = new JourneyBinding(); await binding.open({ goalId: FIRESTORE_GOAL.id });
    get.mockRejectedValue(new Error("closed"));
    await expect(binding.open({ goalId: FIRESTORE_GOAL.id })).rejects.toThrow("closed");
    expect(create).toHaveBeenCalledTimes(1);
    binding.clear(); await binding.open({ goalId: FIRESTORE_GOAL.id });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
