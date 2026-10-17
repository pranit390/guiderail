// Local file stores for published Playbooks and Rules. Firestore can replace these behind the same interfaces.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaybookDraft, Rule } from "./types.ts";

export interface PlaybookStore { publish(d: PlaybookDraft): Promise<void>; list(): Promise<string[]> }
export interface RuleStore { replace(playbookId: string, rules: Rule[]): Promise<void>; all(): Promise<Rule[]> }

export const toMarkdown = (d: PlaybookDraft) =>
  `---\nid: ${d.id}\nappliesTo: ${JSON.stringify(d.appliesTo)}\ngoals: ${JSON.stringify(d.goals)}\nsource: teach\n---\n\n${d.markdown}\n`;

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
export const isSafeId = (id: unknown): id is string => typeof id === "string" && SAFE_ID.test(id);
function assertSafeId(id: unknown): asserts id is string {
  if (!isSafeId(id)) throw new Error(`Invalid Playbook id: ${JSON.stringify(id)}`);
}

async function readAll(dir: string, ext: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(files.filter((f) => f.endsWith(ext)).sort().map((f) => readFile(join(dir, f), "utf8")));
}

export class FilePlaybookStore implements PlaybookStore {
  constructor(private dir: string) {}
  async publish(d: PlaybookDraft) {
    assertSafeId(d.id);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${d.id}.md`), toMarkdown(d));
  }
  list() { return readAll(this.dir, ".md"); }
}

export class FileRuleStore implements RuleStore {
  constructor(private dir: string) {}
  async replace(playbookId: string, rules: Rule[]) {
    assertSafeId(playbookId);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${playbookId}.json`), JSON.stringify({ playbookId, rules }, null, 2));
  }
  async all() {
    return (await readAll(this.dir, ".json")).flatMap((s) => (JSON.parse(s) as { rules: Rule[] }).rules);
  }
}
