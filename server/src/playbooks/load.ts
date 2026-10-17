import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FilePlaybookStore, FileRuleStore } from "./store.ts";
import type { Rule } from "./types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const published = new FilePlaybookStore(join(ROOT, "data", "playbooks"));
const publishedRules = new FileRuleStore(join(ROOT, "data", "rules"));

export async function loadPlaybooks(): Promise<string[]> {
  const seedDir = join(ROOT, "seed", "playbooks");
  // Seed Playbooks are optional; the seed holds only the org's policy and Rules, and how-to
  // knowledge comes from Teach sessions.
  const files = await readdir(seedDir).catch(() => [] as string[]);
  const seed = await Promise.all(files.filter((f) => f.endsWith(".md")).map((f) => readFile(join(seedDir, f), "utf8")));
  return [...seed, ...(await published.list())];
}

// One line per Rule for the Teach-mode prompt, e.g. "Add owner with your first name or team. (block)".
export async function loadRuleLines(): Promise<string[]> {
  const seed = JSON.parse(await readFile(join(ROOT, "seed", "rules", "org-labeling-rules.json"), "utf8")) as { rules: Rule[] };
  const rules = [...seed.rules, ...(await publishedRules.all())];
  return [...new Set(rules.map((r) => `${r.message} (${r.severity})`))];
}
