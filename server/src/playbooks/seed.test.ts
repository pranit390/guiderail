import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlaybook } from "./draft.ts";
import { playbookTitle } from "../instructions.ts";
import { GOALS } from "../../../extension/src/goal-picker.ts";

const dir = join(import.meta.dirname, "..", "..", "..", "seed", "playbooks");
const seeds = readdirSync(dir).filter((f) => f.endsWith(".md"));

// Seed Playbooks are frontmatter (id, appliesTo, goals) plus a markdown body with a title heading.
function parseSeed(file: string) {
  const text = readFileSync(join(dir, file), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no frontmatter`);
  const meta = Object.fromEntries(match[1].split("\n").map((line) => { const i = line.indexOf(":"); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
  return parsePlaybook({ id: meta.id, title: playbookTitle(match[2]), markdown: match[2], appliesTo: JSON.parse(meta.appliesTo), goals: JSON.parse(meta.goals), suggestedRules: [] });
}

describe("seed Playbooks", () => {
  it.each(seeds)("%s parses as a Playbook", (file) => {
    const playbook = parseSeed(file);
    expect(`${playbook.id}.md`).toBe(file);
    expect(playbook.appliesTo.length).toBeGreaterThan(0);
    expect(playbook.markdown).toMatch(/https:\/\/(cloud|firebase)\.google\.com\/.*docs/);
  });
  it("backs every Playbook goal in the side panel", () => {
    const ids = new Set(seeds.map((f) => f.replace(/\.md$/, "")));
    for (const goal of GOALS.filter((g) => g.kind === "playbook")) expect(ids).toContain(goal.id);
  });
});
