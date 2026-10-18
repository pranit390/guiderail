import { describe, expect, it } from "vitest";
import { fitToolResult, TOOL_RESULT_LIMIT, toolResultSize } from "./toolresult.ts";

const RELAY_LIMIT = 4_000;
const wire = (id: string, name: string, response: unknown) => id.length + name.length + JSON.stringify(response).length;

describe("fitToolResult", () => {
  it("counts id and name toward the limit exactly as the relay does", () => {
    const response = { note: "x".repeat(TOOL_RESULT_LIMIT - "call".length - "check_policy".length - JSON.stringify({ note: "" }).length) };
    expect(toolResultSize("call", "check_policy", response)).toBe(TOOL_RESULT_LIMIT);
    expect(fitToolResult("call", "check_policy", response)).toEqual(response);
    expect(fitToolResult("call-1", "check_policy", response)).toEqual({ error: "The check_policy result was too large to send." });
  });

  it("keeps a page read as valid JSON, lowest rank first in page order, with a truncation note", () => {
    const elements = Array.from({ length: 150 }, (_, k) => ({ i: k + 1, role: "link", name: `Product menu link number ${k + 1} for another console area`, section: "Navigation menu" }));
    const rank = elements.map((_, k) => (k >= 120 ? 0 : 4));
    const snap = { url: "https://console.cloud.google.com/run/create", title: "Create service", generation: 7, elements, rank };
    const fitted = fitToolResult("function-call-123", "read_page", snap) as typeof snap & { truncated: { shown: number; total: number } };
    expect(wire("function-call-123", "read_page", JSON.parse(JSON.stringify(fitted)))).toBeLessThanOrEqual(RELAY_LIMIT);
    expect(fitted).not.toHaveProperty("rank");
    expect(fitted.truncated).toMatchObject({ total: 150 });
    expect(fitted.truncated.shown).toBeGreaterThan(30);
    expect(fitted.elements.map((e) => e.i)).toEqual([...elements.slice(120).map((e) => e.i), ...elements.slice(0, fitted.truncated.shown - 30).map((e) => e.i)].sort((a, b) => a - b));
    expect(fitted).toMatchObject({ url: snap.url, title: snap.title, generation: 7 });
    expect(elements).toHaveLength(150);
  });

  it("names a section once per run when trimming and marks a following unsectioned control", () => {
    const elements = [
      ...Array.from({ length: 60 }, (_, k) => ({ i: k + 1, role: "textbox", name: `Label key ${k + 1} for the service`, section: "Labels" })),
      { i: 61, role: "button", name: "Create" },
      ...Array.from({ length: 60 }, (_, k) => ({ i: k + 62, role: "textbox", name: `Container setting ${k + 1}`, section: "Container" })),
    ];
    const fitted = fitToolResult("id", "read_page", { url: "u", title: "t", generation: 1, elements }) as { elements: { i: number; section?: string }[] };
    expect(fitted.elements[0]).toMatchObject({ i: 1, section: "Labels" });
    expect(fitted.elements.slice(1).filter((e) => e.section === "Labels")).toEqual([]);
    const create = fitted.elements.find((e) => e.i === 61);
    if (create) expect(create.section).toBe("");
  });

  it("sends a fitting response unchanged except for the local rank hint", () => {
    const snap = { url: "u", title: "t", generation: 1, elements: [{ i: 1, role: "button", name: "Save", section: "Billing" }], rank: [0] };
    expect(fitToolResult("id", "read_page", snap)).toEqual({ url: "u", title: "t", generation: 1, elements: [{ i: 1, role: "button", name: "Save", section: "Billing" }] });
  });

  it("replaces other oversized results with a bounded error", () => {
    const fitted = fitToolResult("id", "get_guidance", { requirements: Array.from({ length: 200 }, () => "requirement text") });
    expect(fitted).toEqual({ error: "The get_guidance result was too large to send." });
  });
});
