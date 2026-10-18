import { describe, expect, it } from "vitest";
import { STATES, violationState } from "./states.ts";
import { contrastRatio } from "./page.ts";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/panel.css", import.meta.url), "utf8");
function tokens(block: string) {
  const values = new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  function get(name: string): string {
    const value = values.get(name);
    if (!value) throw new Error(`Missing token ${name}`);
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    return alias ? get(alias[1]) : value;
  }
  return get;
}

describe("guiding state contract", () => {
  it.each(["light", "dark"])("asserts actual %s panel text, focus, controls and active-button tokens", (theme) => {
    const roots = [...css.matchAll(/:root\s*\{([^}]+)\}/g)];
    const get = tokens(roots[0][1] + (theme === "dark" ? roots[1][1] : ""));
    for (const surface of ["bg", "surface", "surface-2"]) {
      for (const text of ["ink", "muted", "accent", "ok", "warn"]) {
        expect(contrastRatio(get(text), get(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const edge of ["focus", "control-line"]) expect(contrastRatio(get(edge), get(surface))).toBeGreaterThanOrEqual(3);
    }
    for (const state of ["go", "check"]) expect(contrastRatio(get(`gr-${state}`), get(`gr-${state}-tint`))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(get("gr-on-stop"), get("gr-stop"))).toBeGreaterThanOrEqual(4.5);
  });
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
