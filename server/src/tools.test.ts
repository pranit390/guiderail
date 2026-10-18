import { describe, expect, it } from "vitest";
import { SERVER_TOOLS, tools } from "./tools.ts";

describe("customize tool contract", () => {
  it("offers the Live model only calm or null and delegates to the page", () => {
    const customize = tools.find((tool) => tool.name === "customize");
    expect(customize?.parameters).toEqual({
      type: "OBJECT",
      properties: { preset: { type: "STRING", enum: ["calm"], nullable: true } },
      required: ["preset"],
    });
    expect(SERVER_TOOLS.has("customize")).toBe(false);
  });
});

describe("Assist fill contract", () => {
  it("offers the Live model no fill, click, submit or send tool", () => {
    const names = tools.map((tool) => tool.name);
    for (const name of ["fill_field", "click", "submit", "send"]) expect(names).not.toContain(name);
  });
});
