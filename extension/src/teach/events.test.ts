import { describe, expect, it } from "vitest";
import { compact, MASK, maskValue, MAX_EVENTS, type TeachEvent } from "./events.ts";

describe("maskValue", () => {
  it.each([
    ["sk-live-abcdefghijklmnopqrstuvwxyz123456"],
    ["AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456ghi789"],
    ["-----BEGIN PRIVATE KEY-----\nMIIE"],
    ["4f9a8c7e6d5b4a3928171615141312110f0e0d0c"],
  ])("masks %s", (secret) => expect(maskValue(secret)).toBe(MASK));

  it.each([["ocr-service"], ["us-central1"], ["pranit@example.com"], ["roles/run.developer"], ["Deploy OCR to prod"]])(
    "keeps %s",
    (plain) => expect(maskValue(plain)).toBe(plain),
  );
});

describe("compact", () => {
  const field = (n: number, value: string): TeachEvent => ({
    t: "field", at: n, url: "u", target: { role: "textbox", name: "Service name" }, value,
  });

  it("keeps only the last of consecutive field events on the same target", () => {
    const out = compact([field(1, "o"), field(2, "oc"), field(3, "ocr")]);
    expect(out).toEqual([field(3, "ocr")]);
  });

  it("caps a huge session at MAX_EVENTS and keeps the newest events", () => {
    const many: TeachEvent[] = Array.from({ length: 2000 }, (_, i) => ({ t: "navigate", at: i, url: `u${i}`, title: "" }));
    const out = compact(many);
    expect(out).toHaveLength(MAX_EVENTS);
    expect(out.at(-1)).toMatchObject({ at: 1999 });
  });
});
