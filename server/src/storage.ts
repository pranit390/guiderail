import { join } from "node:path";
import { FilePlaybookStore, FileRuleStore } from "./playbooks/store.ts";
import { FirestorePlaybookStore, FirestoreRuleStore } from "./playbooks/firestore-store.ts";
import { FileJourneyStore } from "./journeys/store.ts";
import { FirestoreJourneyStore } from "./journeys/firestore-store.ts";

const ROOT = join(import.meta.dirname, "../..");
export function createStores(env = process.env) {
  if (env.STORE === "firestore") return {
    playbookStore: new FirestorePlaybookStore(),
    ruleStore: new FirestoreRuleStore(),
    journeyStore: new FirestoreJourneyStore(),
  };
  if (env.STORE && env.STORE !== "file") throw new Error("STORE must be file or firestore.");
  return {
    playbookStore: new FilePlaybookStore(join(ROOT, "data", "playbooks")),
    ruleStore: new FileRuleStore(join(ROOT, "data", "rules")),
    journeyStore: new FileJourneyStore(env.JOURNEY_CACHE_DIR ?? join(ROOT, "data", "journeys")),
  };
}

export const { playbookStore, ruleStore, journeyStore } = createStores();
