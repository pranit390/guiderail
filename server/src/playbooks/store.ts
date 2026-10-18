// Local file stores remain the default for development and tests.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaybookDraft, Rule } from "./types.ts";
import { isSafeId, parsePlaybook, parseRules } from "./draft.ts";
export { isSafeId } from "./draft.ts";

export interface PlaybookStore { publish(d: PlaybookDraft, ownerUid?: string): Promise<void>; list(): Promise<string[]> }
export interface RuleStore { replace(playbookId: string, rules: Rule[], ownerUid?: string): Promise<void>; all(): Promise<Rule[]> }

export const toMarkdown = (d: PlaybookDraft) =>
  `---\nid: ${d.id}\nappliesTo: ${JSON.stringify(d.appliesTo)}\ngoals: ${JSON.stringify(d.goals)}\nsource: teach\n---\n\n${d.markdown}\n`;

export function assertSafeId(id: unknown): asserts id is string {
  if (!isSafeId(id)) throw new Error(`Invalid Playbook id: ${JSON.stringify(id)}`);
}

async function readNamed(dir: string, ext: string): Promise<{ name: string; text: string }[]> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(ext)).sort();
  return Promise.all(files.map(async (name) => ({ name, text: await readFile(join(dir, name), "utf8") })));
}
const readAll = async (dir: string, ext: string) => (await readNamed(dir, ext)).map((f) => f.text);

export class FilePlaybookStore implements PlaybookStore {
  constructor(private dir: string) {}
  async publish(d: PlaybookDraft, _ownerUid?: string) {
    assertSafeId(d.id);
    const valid = parsePlaybook(d);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${valid.id}.md`), toMarkdown(valid));
  }
  list() { return readAll(this.dir, ".md"); }
}

export class FileRuleStore implements RuleStore {
  constructor(private dir: string) {}
  async replace(playbookId: string, rules: Rule[], _ownerUid?: string) {
    assertSafeId(playbookId);
    const valid = parseRules(rules);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${playbookId}.json`), JSON.stringify({ playbookId, rules: valid }, null, 2));
  }
  async all() {
    return (await readNamed(this.dir, ".json")).flatMap(({ name, text }) => {
      try {
        const parsed = JSON.parse(text) as { rules?: unknown };
        if (parsed) return parseRules(parsed.rules);
      } catch {}
      console.warn(`[rules] Skipping ${join(this.dir, name)}: not JSON with a rules array`);
      return [];
    });
  }
}
