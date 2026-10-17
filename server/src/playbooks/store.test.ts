import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilePlaybookStore, FileRuleStore, toMarkdown } from "./store.ts";
import type { PlaybookDraft, Rule } from "./types.ts";

const rule = (id: string): Rule => ({ id, scope: { url: "x*", section: "Labels" }, guide: { explain: "", format: "", examples: [], suggest: null },
  check: { kind: "label_required", key: "owner" }, severity: "warn", message: "m" });
const draft: PlaybookDraft = { id: "cloud-run-deploy", title: "Deploy", appliesTo: ["console.cloud.google.com/run*"], goals: ["deploy"], markdown: "# Deploy\n1. Step", suggestedRules: [] };

describe("stores", () => {
  it("writes markdown with frontmatter", () => {
    expect(toMarkdown(draft)).toMatch(/^---\nid: cloud-run-deploy\n/);
  });
  it("overwrites a Playbook published twice under the same id", async () => {
    const s = new FilePlaybookStore(mkdtempSync(join(tmpdir(), "pb-")));
    await s.publish(draft);
    await s.publish({ ...draft, markdown: "# Deploy v2" });
    const all = await s.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toContain("# Deploy v2");
  });
  it("replaces, not appends, a Playbook's Rules", async () => {
    const r = new FileRuleStore(mkdtempSync(join(tmpdir(), "rules-")));
    await r.replace("cloud-run-deploy", [rule("a"), rule("b")]);
    await r.replace("cloud-run-deploy", [rule("c")]);
    expect((await r.all()).map((x) => x.id)).toEqual(["c"]);
  });
  it("skips corrupt Rules files instead of crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corrupt-"));
    const r = new FileRuleStore(dir);
    await r.replace("good", [rule("a")]);
    writeFileSync(join(dir, "broken.json"), "{ not json");
    writeFileSync(join(dir, "norules.json"), JSON.stringify({ playbookId: "x" }));
    expect((await r.all()).map((x) => x.id)).toEqual(["a"]);
  });
  it("refuses an unsafe id and writes nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "unsafe-"));
    const dir = join(root, "pb");
    await expect(new FilePlaybookStore(dir).publish({ ...draft, id: "../x" })).rejects.toThrow(/Invalid Playbook id/);
    await expect(new FileRuleStore(dir).replace("../x", [])).rejects.toThrow(/Invalid Playbook id/);
    expect(existsSync(join(root, "x.md"))).toBe(false);
    expect(existsSync(join(root, "x.json"))).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });
  it("returns nothing from an empty directory that doesn't exist yet", async () => {
    expect(await new FilePlaybookStore(join(tmpdir(), "missing-" + Date.now())).list()).toEqual([]);
  });
});
