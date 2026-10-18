import { describe, expect, it } from "vitest";
import { STATES, violationState } from "./states.ts";
import { contrastRatio } from "./page.ts";

describe("guiding state contract", () => {
  it("reserves Stop for blocking Rules and keeps warnings in Check", () => {
    expect(violationState("block")).toBe("stop");
    expect(violationState("warn")).toBe("check");
  });
  it.each(["#ffffff", "#f1f3f4", "#e8f0fe"])("passes text and edge contrast on %s", (background) => {
    for (const state of Object.values(STATES)) expect(contrastRatio(state.light, background)).toBeGreaterThanOrEqual(4.5);
  });
  it("passes on dark surfaces", () => {
    for (const state of Object.values(STATES)) {
      expect(contrastRatio(state.dark, "#141a18")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(state.dark, "#202124")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
