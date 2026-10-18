// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { highlightRegion, overlaps, padded, placeTag } from "./highlight-layout.ts";

const target = { left: 300, top: 200, width: 240, height: 40 };
const size = { width: 160, height: 30 };
const viewport = { width: 1000, height: 700 };
afterEach(() => document.body.replaceChildren());

describe("Here tag free-space placement", () => {
  it("prefers right, then left, then above, then below", () => {
    const right = placeTag(target, size, viewport, [])!;
    expect(right).toMatchObject({ left: 552, top: 205 });
    const left = placeTag(target, size, viewport, [right])!;
    expect(left.left).toBe(128);
    const above = placeTag(target, size, viewport, [right, left])!;
    expect(above.top).toBe(158);
    const below = placeTag(target, size, viewport, [right, left, above])!;
    expect(below.top).toBe(252);
    expect(placeTag(target, size, viewport, [right, left, above, below])).toBeNull();
  });
  it("treats description text as occupied space and hides rather than covering it", () => {
    expect(placeTag({ left: 8, top: 8, width: 280, height: 24 }, size, { width: 320, height: 200 }, [
      { left: 8, top: 36, width: 304, height: 150 },
    ])).toBeNull();
  });
  it("clamps cross-axis coordinates and keeps target clearance at viewport edges", () => {
    for (const left of [-20, 8, 300, 800, 980]) for (const top of [-20, 8, 200, 660, 690]) {
      const t = { ...target, left, top };
      const spot = placeTag(t, size, viewport, []);
      if (!spot) continue;
      expect(spot.left).toBeGreaterThanOrEqual(8);
      expect(spot.top).toBeGreaterThanOrEqual(8);
      expect(spot.left + spot.width).toBeLessThanOrEqual(992);
      expect(spot.top + spot.height).toBeLessThanOrEqual(692);
      expect(overlaps(spot, padded(t, 8))).toBe(false);
    }
  });
  it("hides oversized or unmeasured tags", () => {
    expect(placeTag(target, { width: 1000, height: 30 }, viewport, [])).toBeNull();
    expect(placeTag(target, { width: 0, height: 0 }, viewport, [])).toBeNull();
  });
});

describe("saved Firestore wizard semantic geometry", () => {
  function layout(el: Element, rect: DOMRect) {
    el.getBoundingClientRect = () => rect;
    Object.defineProperty(el, "getClientRects", { value: () => [rect] });
  }
  it("frames the entire Production radio label with its corner radius, without selecting anything", () => {
    document.body.innerHTML = readFileSync("fixtures/firestore-create.html", "utf8");
    const radio = document.querySelector<HTMLInputElement>("#production")!;
    const label = document.querySelector<HTMLLabelElement>('label[for="production"]')!;
    layout(radio, new DOMRect(100, 200, 16, 16));
    layout(label, new DOMRect(100, 196, 240, 28));
    label.style.borderRadius = "4px";
    expect(highlightRegion(radio)).toEqual({ rect: { left: 100, top: 196, width: 240, height: 28 }, radius: 4 });
    expect(radio.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#test")!.checked).toBe(false);
  });
  it("includes a separate associated checkbox label and a role radio container", () => {
    document.body.innerHTML = '<input type="checkbox" id="agree"><label for="agree">I agree</label><div role="radio" style="border-radius:8px"><span>Standard edition</span></div>';
    const input = document.querySelector("input")!, label = document.querySelector("label")!;
    layout(input, new DOMRect(20, 40, 16, 16)); layout(label, new DOMRect(44, 36, 80, 24));
    expect(highlightRegion(input).rect).toEqual({ left: 20, top: 36, width: 104, height: 24 });
    const role = document.querySelector('[role="radio"]')!;
    layout(role, new DOMRect(20, 100, 300, 80));
    expect(highlightRegion(role)).toMatchObject({ rect: { width: 300, height: 80 }, radius: 8 });
  });
});
