import { describe, expect, it } from "vitest";
import { fitToolResult, TOOL_RESULT_LIMIT, toolResultSize } from "./toolresult.ts";

const RELAY_LIMIT = 4_000;
const wire = (id: string, name: string, response: unknown) => id.length + name.length + JSON.stringify(response).length;

describe("fitToolResult", () => {
  it("counts id and name toward the limit exactly as the relay does", () => {
    const response = { note: "x".repeat(TOOL_RESULT_LIMIT - "call".length - "check_policy".length - JSON.stringify({ note: "" }).length) };
    expect(toolResultSize("call", "check_policy", response)).toBe(TOOL_RESULT_LIMIT);
    expect(fitToolResult("call", "check_policy", response)).toBe(response);
    expect(fitToolResult("call-1", "check_policy", response)).toEqual({ error: "The check_policy result was too large to send." });
  });

  it("keeps a page read as valid JSON with the first controls and a truncation note", () => {
    const elements = Array.from({ length: 150 }, (_, k) => ({ i: k + 1, role: "button", name: `Control ${k + 1} `.padEnd(80, "n"), section: "Section".padEnd(40, "s") }));
    const snap = { url: "https://console.cloud.google.com/run/create", title: "Create service", generation: 7, elements };
    const fitted = fitToolResult("function-call-123", "read_page", snap) as typeof snap & { truncated: { shown: number; total: number } };
    expect(wire("function-call-123", "read_page", JSON.parse(JSON.stringify(fitted)))).toBeLessThanOrEqual(RELAY_LIMIT);
    expect(fitted.elements).toEqual(elements.slice(0, fitted.truncated.shown));
    expect(fitted.truncated).toMatchObject({ total: 150 });
    expect(fitted.truncated.shown).toBeGreaterThan(0);
    expect(fitted).toMatchObject({ url: snap.url, title: snap.title, generation: 7 });
    expect(elements).toHaveLength(150);
  });

  it("replaces other oversized results with a bounded error", () => {
    const fitted = fitToolResult("id", "get_guidance", { requirements: Array.from({ length: 200 }, () => "requirement text") });
    expect(fitted).toEqual({ error: "The get_guidance result was too large to send." });
  });
});
