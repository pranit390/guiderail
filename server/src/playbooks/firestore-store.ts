import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDatabase } from "../firestore.ts";
import { parsePlaybook, parseRules } from "./draft.ts";
import { assertSafeId, toMarkdown, type PlaybookStore, type RuleStore } from "./store.ts";
import type { PlaybookDraft, Rule } from "./types.ts";

const owned = (body: object, ownerUid?: string) => ({ ...body, ownerUid: ownerUid ?? null, updatedAt: new Date().toISOString() });

// Cloud Run runs a single instance, so each store caches its collection read until its next write.
function cachedRead<T>(read: () => Promise<T>) {
  let cached: Promise<T> | undefined;
  return {
    get: () => cached ??= read().catch((error) => { cached = undefined; throw error; }),
    clear: () => { cached = undefined; },
  };
}

function parseEach<T>(docs: QueryDocumentSnapshot[], label: string, parse: (doc: QueryDocumentSnapshot) => T[]) {
  return docs.flatMap((doc) => {
    try { return parse(doc); }
    catch (error) {
      console.warn(`[${label}] Skipping Firestore document ${label}/${doc.id}: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  });
}

// Published knowledge remains shared, matching the file stores and Live prompts.
export class FirestorePlaybookStore implements PlaybookStore {
  private cache = cachedRead(async () => parseEach((await this.db.collection("playbooks").get()).docs, "playbooks", (doc) => {
    const playbook = parsePlaybook(doc.data().playbook);
    if (playbook.id !== doc.id) throw new Error("Stored Playbook id does not match its document.");
    return [toMarkdown(playbook)];
  }));
  constructor(private db: Firestore = getDatabase()) {}
  async publish(draft: PlaybookDraft, ownerUid?: string) {
    assertSafeId(draft.id);
    const playbook = parsePlaybook(draft);
    await this.db.collection("playbooks").doc(playbook.id).set(owned({ playbook }, ownerUid));
    this.cache.clear();
  }
  list() { return this.cache.get(); }
}

export class FirestoreRuleStore implements RuleStore {
  private cache = cachedRead(async () =>
    parseEach((await this.db.collection("rules").get()).docs, "rules", (doc) => parseRules(doc.data().rules)));
  constructor(private db: Firestore = getDatabase()) {}
  async replace(playbookId: string, rules: Rule[], ownerUid?: string) {
    assertSafeId(playbookId);
    const valid = parseRules(rules);
    await this.db.collection("rules").doc(playbookId).set(owned({ playbookId, rules: valid }, ownerUid));
    this.cache.clear();
  }
  all() { return this.cache.get(); }
}
