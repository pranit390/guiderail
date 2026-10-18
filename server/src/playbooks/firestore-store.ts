import type { Firestore } from "firebase-admin/firestore";
import { getDatabase, writeOwnedDocument } from "../firestore.ts";
import { parsePlaybook, parseRules } from "./draft.ts";
import { assertSafeId, toMarkdown, type PlaybookStore, type RuleStore } from "./store.ts";
import type { PlaybookDraft, Rule } from "./types.ts";

// Published knowledge remains shared, matching the file stores and Live prompts.
export class FirestorePlaybookStore implements PlaybookStore {
  constructor(private db: Firestore = getDatabase()) {}
  async publish(draft: PlaybookDraft, ownerUid?: string) {
    assertSafeId(draft.id);
    const playbook = parsePlaybook(draft);
    await writeOwnedDocument(this.db, this.db.collection("playbooks").doc(playbook.id), { playbook }, ownerUid);
  }
  async list() {
    const snapshot = await this.db.collection("playbooks").get();
    return snapshot.docs.map((doc) => {
      const playbook = parsePlaybook(doc.data().playbook);
      if (playbook.id !== doc.id) throw new Error("Stored Playbook id does not match its document.");
      return toMarkdown(playbook);
    });
  }
}

export class FirestoreRuleStore implements RuleStore {
  constructor(private db: Firestore = getDatabase()) {}
  async replace(playbookId: string, rules: Rule[], ownerUid?: string) {
    assertSafeId(playbookId);
    const valid = parseRules(rules);
    await writeOwnedDocument(this.db, this.db.collection("rules").doc(playbookId), { playbookId, rules: valid }, ownerUid);
  }
  async all() {
    const snapshot = await this.db.collection("rules").get();
    return snapshot.docs.flatMap((doc) => parseRules(doc.data().rules));
  }
}
