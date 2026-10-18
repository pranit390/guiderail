import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { playbookStore, ruleStore } from "../storage.ts";
import type { Rule } from "./types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

export async function loadPlaybooks(): Promise<string[]> {
  const seedDir = join(ROOT, "seed", "playbooks");
  // Seed Playbooks are optional; the seed holds only the org's policy and Rules, and how-to
  // knowledge comes from Teach sessions.
  const files = await readdir(seedDir).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  const seed = await Promise.all(files.filter((f) => f.endsWith(".md")).map((f) => readFile(join(seedDir, f), "utf8")));
  return [...seed, ...(await playbookStore.list())];
}

// One line per Rule for the Teach-mode prompt, e.g. "Add owner with your first name or team. (block)".
export async function loadRuleLines(): Promise<string[]> {
  const seed = JSON.parse(await readFile(join(ROOT, "seed", "rules", "org-labeling-rules.json"), "utf8")) as { rules: Rule[] };
  const rules = [...seed.rules, ...(await ruleStore.all())];
  return [...new Set(rules.map((r) => `${r.message} (${r.severity})`))];
}
