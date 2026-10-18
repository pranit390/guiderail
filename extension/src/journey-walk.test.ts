// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureDraft } from "../../server/src/journeys/fixture.ts";
import { FIRESTORE_GOAL, type CompileResult } from "../../shared/journey.ts";
import { renderJourney } from "./journey-panel.ts";
import { mountJourneyWalk } from "./journey-walk.ts";
import type { PageSnapshot } from "./messages.ts";
const result: CompileResult = { cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 1, compiledAt: "2026-10-18T00:00:00Z", retrieval: [] } };
const page = (names: string[]): PageSnapshot => ({ url: FIRESTORE_GOAL.consoleUrl, title: "Firestore", generation: 1, elements: names.map((name, i) => ({ name, i, role: "button" })) });
function mount() {
  const parent = document.createElement("div"); document.body.append(parent); renderJourney(parent, result);
  const read = vi.fn().mockResolvedValue(page([])); const point = vi.fn().mockResolvedValue({ found: true }); const changed = vi.fn(); const prompt = vi.fn();
  const walk = mountJourneyWalk(parent, result.journey, read, point, changed, undefined, undefined, prompt);
  const [reread, next, skip] = [...parent.querySelectorAll("button")];
  return { parent, read, point, changed, prompt, walk, reread, next, skip };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });
describe("cited Guide walk", () => {
  it("updates the current header when a unique later control is pointed to, without reporting earlier Steps done", () => {
    const { parent, walk, next } = mount();
    walk.pointed("Start in Production mode");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 9 of 10 · Production mode");
    expect(parent.querySelector('[aria-current="step"] strong')?.textContent).toBe("Production mode");
    expect(parent.textContent).not.toContain("reported this Step done");
    expect(parent.querySelector("li p:last-child")?.textContent).toBe("Not checked on this screen.");
    expect(next.disabled).toBe(false);
    expect(next.className).toBe("journey-next");
    next.click();
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 10 of 10 · Create");
    expect(next.disabled).toBe(true);
    walk.pointed("Create"); expect(next.disabled).toBe(true);
  });
  it("moves only on a whole-phrase match and never fuzzily to Create", () => {
    const { parent, walk, next } = mount();
    walk.pointed("Create database"); walk.pointed("Firestore Studio"); walk.pointed("Add database later");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 1 of 10 · Databases & Storage");
    expect(next.disabled).toBe(true);
    walk.pointed("Cloud Firestore");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 2 of 10 · Firestore");
  });
  it("does not infer a current Step from a repeated Next name or an unrelated pointer", () => {
    const { parent, walk, next } = mount();
    walk.pointed("Next"); walk.pointed("Billing");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 1 of 10 · Databases & Storage");
    expect(next.disabled).toBe(true);
  });
  it("keeps a missing Step citation, never guesses a highlight, and explicitly skips", async () => {
    const { parent, read, point, reread, next, skip } = mount(); reread.click();
    await vi.waitFor(() => expect(reread.disabled).toBe(false));
    expect(read).toHaveBeenCalledOnce(); expect(point).not.toHaveBeenCalled(); expect(next.disabled).toBe(true);
    expect(parent.textContent).toContain("The doc says Databases & Storage. I can't see it on this screen.");
    expect(parent.querySelector("li a")?.getAttribute("href")).toBe(FIRESTORE_GOAL.sourceUrls[0]);
    skip.click(); expect(parent.querySelector('[aria-current="step"] strong')?.textContent).toBe("Firestore");
    expect(parent.textContent).toContain("Explicitly skipped by you; not verified.");
  });
  it("refuses duplicate names and failed highlights", async () => {
    const { read, point, reread, next, parent } = mount();
    read.mockResolvedValue(page(["Databases & Storage", "Databases & Storage"])); reread.click();
    await vi.waitFor(() => expect(reread.disabled).toBe(false)); expect(point).not.toHaveBeenCalled(); expect(next.disabled).toBe(true);
    read.mockResolvedValue(page(["Databases & Storage"])); point.mockResolvedValue({ found: false }); reread.click();
    await vi.waitFor(() => expect(parent.textContent).toContain("could not be highlighted")); expect(next.disabled).toBe(true);
  });
  it("does not let an in-flight highlight re-enable a stale Step", async () => {
    const { read, point, reread, next, walk } = mount(); read.mockResolvedValue(page(["Databases & Storage"]));
    let finish: (value: unknown) => void = () => {};
    point.mockImplementation(() => new Promise((resolve) => { finish = resolve; })); reread.click();
    await vi.waitFor(() => expect(point).toHaveBeenCalled()); walk.invalidate("Tab changed"); finish({ found: true });
    await vi.waitFor(() => expect(reread.disabled).toBe(false)); expect(next.disabled).toBe(true);
  });
  it("automatically points the first Step and announces it once", async () => {
    vi.useFakeTimers();
    const { read, point, prompt } = mount(); read.mockResolvedValue(page(["Databases & Storage"]));
    await vi.advanceTimersByTimeAsync(599); expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(point).toHaveBeenCalledExactlyOnceWith("Databases & Storage", "button");
    expect(prompt).toHaveBeenCalledExactlyOnceWith("Step 1: Databases & Storage. You operate this control.");
    await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledOnce();
  });
  it("debounces page changes and caps missing-target attempts at two, keeping manual retry", async () => {
    vi.useFakeTimers();
    const { read, point, prompt, walk, reread } = mount();
    walk.invalidate("page changed", true);
    await vi.advanceTimersByTimeAsync(400); walk.invalidate("wizard changed", true);
    await vi.advanceTimersByTimeAsync(599); expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledOnce(); expect(prompt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000); expect(read).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenCalledExactlyOnceWith("I can't see Databases & Storage on this screen yet. Re-read this Step to retry.");
    read.mockResolvedValue(page(["Databases & Storage"])); reread.click(); await vi.advanceTimersByTimeAsync(0);
    expect(point).toHaveBeenCalledOnce(); expect(reread.disabled).toBe(false);
  });
  it("does not repeat the same Step announcement or retry prompt across same-tab invalidations", async () => {
    vi.useFakeTimers();
    const { read, point, prompt, walk } = mount(); read.mockResolvedValue(page(["Databases & Storage"]));
    await vi.advanceTimersByTimeAsync(600);
    walk.invalidate("wizard changed", true); await vi.advanceTimersByTimeAsync(600);
    walk.invalidate("wizard changed", true); await vi.advanceTimersByTimeAsync(600);
    expect(point).toHaveBeenCalledTimes(3);
    expect(prompt).toHaveBeenCalledExactlyOnceWith("Step 1: Databases & Storage. You operate this control.");
    read.mockResolvedValue(page([]));
    walk.invalidate("wizard changed", true); await vi.advanceTimersByTimeAsync(1_200);
    walk.invalidate("wizard changed", true); await vi.advanceTimersByTimeAsync(1_200);
    expect(read).toHaveBeenCalledTimes(7); expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenLastCalledWith("I can't see Databases & Storage on this screen yet. Re-read this Step to retry.");
  });
  it("re-points after a same-tab page change but cancels work on another tab or after ending", async () => {
    vi.useFakeTimers();
    const { read, point, walk } = mount(); read.mockResolvedValue(page(["Databases & Storage"]));
    await vi.advanceTimersByTimeAsync(600); expect(point).toHaveBeenCalledOnce();
    walk.invalidate("route changed", true); await vi.advanceTimersByTimeAsync(600); expect(point).toHaveBeenCalledTimes(2);
    walk.invalidate("route changed", true); walk.invalidate("different tab");
    await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(2);
    walk.setEnabled(false); walk.invalidate("late page event", true);
    await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(2);
  });
  it("advances on a pointed click even when route invalidation arrives first, then auto-points the next Step", async () => {
    vi.useFakeTimers();
    const { read, point, walk, parent } = mount(); read.mockResolvedValue(page(["Databases & Storage"]));
    await vi.advanceTimersByTimeAsync(600);
    walk.invalidate("route changed", true); walk.acted("You clicked the highlighted control.");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 2 of 10 · Firestore");
    read.mockResolvedValue(page(["Firestore"])); await vi.advanceTimersByTimeAsync(600);
    expect(point).toHaveBeenLastCalledWith("Firestore", "button");
    walk.invalidate("different tab"); walk.acted("late click");
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 2 of 10 · Firestore");
  });
  it("runs the pending page read after a stale in-flight read finishes", async () => {
    vi.useFakeTimers();
    const { read, point, walk } = mount();
    let finish!: (value: PageSnapshot) => void;
    read.mockImplementationOnce(() => new Promise<PageSnapshot>((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(600); walk.invalidate("wizard changed", true);
    await vi.advanceTimersByTimeAsync(600); expect(read).toHaveBeenCalledOnce();
    read.mockResolvedValue(page(["Databases & Storage"])); finish(page([]));
    await vi.advanceTimersByTimeAsync(600); expect(point).toHaveBeenCalledOnce();
  });
  it("never automatically advances Create or trusts an unpointed click", async () => {
    vi.useFakeTimers();
    const { walk, parent } = mount();
    walk.acted("unpointed click"); expect(parent.querySelector(".journey-current h2")?.textContent).toContain("Step 1");
    walk.pointed("Create"); walk.acted("You clicked Create.");
    await vi.advanceTimersByTimeAsync(0);
    expect(parent.querySelector(".journey-current h2")?.textContent).toBe("Step 10 of 10 · Create");
    expect(parent.textContent).not.toContain("database created");
  });
  it("uses the shared unique fuzzy match and canonical name, refusing weak matches and ties", async () => {
    const { read, point, reread, next } = mount();
    read.mockResolvedValue(page(["Databases & Storage menu"])); reread.click();
    await vi.waitFor(() => expect(next.disabled).toBe(false));
    expect(point).toHaveBeenLastCalledWith("Databases & Storage menu", "button");
    point.mockClear(); read.mockResolvedValue(page(["Storage settings"])); reread.click();
    await vi.waitFor(() => expect(reread.disabled).toBe(false));
    expect(next.disabled).toBe(true); expect(point).not.toHaveBeenCalled();
    read.mockResolvedValue(page(["Databases & Storage menu", "Databases & Storage tab"])); reread.click();
    await vi.waitFor(() => expect(reread.disabled).toBe(false));
    expect(next.disabled).toBe(true); expect(point).not.toHaveBeenCalled();
  });
  it("requires manual progress and stops at the human Create boundary", async () => {
    const { read, point, reread, next, skip, parent } = mount();
    for (const step of result.journey.steps) {
      read.mockResolvedValue(page([step.control])); reread.click();
      await vi.waitFor(() => expect(reread.disabled).toBe(false));
      expect(point).toHaveBeenLastCalledWith(step.control, "button");
      if (step.control === "Create") { expect(next.disabled).toBe(true); break; }
      expect(next.disabled).toBe(false); next.click();
    }
    expect(parent.querySelector('[aria-current="step"] strong')?.textContent).toBe("You click Create");
    skip.click(); expect(parent.textContent).toContain("has not verified database creation");
  });
});
