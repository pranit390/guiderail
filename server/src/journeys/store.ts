import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FIRESTORE_GOAL, parseCompiledJourney, type CompiledJourney } from "../../../shared/journey.ts";

export interface JourneyStore { get(): Promise<CompiledJourney | undefined>; put(journey: CompiledJourney): Promise<void> }
// Changing the source contract/version invalidates the cache without a public cache-bypass endpoint.
const key = createHash("sha256").update(JSON.stringify(FIRESTORE_GOAL)).digest("hex");
export class FileJourneyStore implements JourneyStore {
  constructor(private dir: string) {}
  async get() {
    try { return parseCompiledJourney(JSON.parse(await readFile(join(this.dir, `${key}.json`), "utf8"))); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code !== "ENOENT") throw error;
      return undefined;
    }
  }
  async put(journey: CompiledJourney) {
    const valid = parseCompiledJourney(journey);
    await mkdir(this.dir, { recursive: true });
    const temp = join(this.dir, `${key}-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(valid, null, 2));
    await rename(temp, join(this.dir, `${key}.json`));
  }
}
export const journeyStore = new FileJourneyStore(process.env.JOURNEY_CACHE_DIR ?? join(import.meta.dirname, "../../../data/journeys"));
