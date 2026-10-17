import { describe, expect, it } from "vitest";
import { instructionFor, playbookTitle, teachInstructionFor } from "./instructions.ts";

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
  it("teach mode includes the goal, org rules and playbook titles, and forbids echoing events", () => {
    const s = teachInstructionFor({ goal: "Deploy a Cloud Run service our way", rules: ["owner label: first name (block)"], playbookTitles: ["Deploy a Cloud Run service"] });
    expect(s).toContain('"Deploy a Cloud Run service our way"');
    expect(s).toContain("- owner label: first name (block)");
    expect(s).toContain("- Deploy a Cloud Run service");
    expect(s).toMatch(/NEVER repeat/);
    expect(s).toContain("Is this still part of the task?");
  });
  it("teach mode without a goal asks what is being taught", () => {
    expect(teachInstructionFor()).toContain("What task are you teaching?");
  });
});

describe("playbookTitle", () => {
  it("takes the first markdown heading", () => {
    expect(playbookTitle("---\nid: x\n---\n\n# Deploy a Cloud Run service\n1. Step")).toBe("Deploy a Cloud Run service");
    expect(playbookTitle("no heading")).toBe("Untitled playbook");
  });
});
