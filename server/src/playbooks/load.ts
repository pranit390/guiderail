import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FilePlaybookStore } from "./store.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const published = new FilePlaybookStore(join(ROOT, "data", "playbooks"));

export async function loadPlaybooks(): Promise<string[]> {
  const seedDir = join(ROOT, "seed", "playbooks");
  const seed = await Promise.all((await readdir(seedDir)).filter((f) => f.endsWith(".md")).map((f) => readFile(join(seedDir, f), "utf8")));
  return [...seed, ...(await published.list())];
}
