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
  const read = vi.fn().mockResolvedValue(page([])); const point = vi.fn().mockResolvedValue({ found: true }); const changed = vi.fn();
  const walk = mountJourneyWalk(parent, result.journey, read, point, changed);
  const [reread, next, skip] = [...parent.querySelectorAll("button")];
  return { parent, read, point, changed, walk, reread, next, skip };
}
afterEach(() => document.body.replaceChildren());
describe("cited Guide walk", () => {
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
