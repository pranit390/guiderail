import { describe, expect, it } from "vitest";
import { instructionFor } from "./instructions.ts";

describe("instructionFor", () => {
  it("guide mode includes the guide instruction and every Playbook", () => {
    const s = instructionFor("guide", ["# A", "# B"]);
    expect(s).toContain("Guide first, guard second");
    expect(s).toContain("# A");
    expect(s).toContain("# B");
  });
  it("teach mode tells the model to listen and ask why, not guide", () => {
    const s = instructionFor("teach", ["# A"]);
    expect(s).toContain("Teach mode");
    expect(s).toMatch(/do not guide/i);
    expect(s).not.toContain("# A");
  });
});
