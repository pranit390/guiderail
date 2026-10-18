import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRESTORE_GOAL, parseCompiledJourney } from "../../shared/journey.ts";
import { fixtureDraft } from "./journeys/fixture.ts";
import { FileJourneyStore, journeyCacheKey } from "./journeys/store.ts";
import { FilePlaybookStore, FileRuleStore } from "./playbooks/store.ts";
import { FirestoreJourneyStore } from "./journeys/firestore-store.ts";
import { FirestorePlaybookStore, FirestoreRuleStore } from "./playbooks/firestore-store.ts";
import { getDatabase } from "./firestore.ts";
import { fakeFirestore } from "./testing/firestore.ts";
import { createStores } from "./storage.ts";
import type { PlaybookDraft, Rule } from "./playbooks/types.ts";

vi.mock("./firestore.ts", async (original) => {
  const actual = await original<typeof import("./firestore.ts")>();
  const { fakeFirestore } = await import("./testing/firestore.ts");
  return { ...actual, getDatabase: () => process.env.FIRESTORE_EMULATOR_HOST ? actual.getDatabase() : fakeFirestore };
});

const rule: Rule = { id: "owner", scope: { url: "x*", section: "Labels" },
  guide: { explain: "Owner needed", format: "team", examples: [], suggest: null },
  check: { kind: "label_required", key: "owner" }, severity: "block", message: "Add owner" };
const draft: PlaybookDraft = { id: "deploy", title: "Deploy", markdown: "# Deploy\n1. Choose region",
  appliesTo: ["console.cloud.google.com/run*"], goals: ["deploy"], suggestedRules: [rule] };
const journey = parseCompiledJourney({ ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version,
  compiledAt: "2026-10-18T00:00:00.000Z", durationMs: 1,
  retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) });
let directory: string;
beforeAll(() => { vi.stubEnv("FIREBASE_PROJECT_ID", "demo-guiderail-stores"); });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "guiderail-storage-"));
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Only the explicitly configured emulator, in a dedicated demo project, is ever cleaned up.
    const db = getDatabase();
    for (const name of ["playbooks", "rules", "journeys"]) await db.recursiveDelete(db.collection(name));
  } else fakeFirestore.documents.clear();
});
afterAll(() => { vi.unstubAllEnvs(); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const factories = {
  file: () => ({
    playbooks: new FilePlaybookStore(join(directory, "playbooks")),
    rules: new FileRuleStore(join(directory, "rules")),
    journeys: new FileJourneyStore(join(directory, "journeys")),
  }),
  [process.env.FIRESTORE_EMULATOR_HOST ? "firestore emulator" : "firestore in-memory fake"]: () => ({
    playbooks: new FirestorePlaybookStore(), rules: new FirestoreRuleStore(), journeys: new FirestoreJourneyStore(),
  }),
};

describe.each(Object.entries(factories))("%s store contract", (_name, stores) => {
  it("starts empty and reloads a replacement Playbook from a new instance", async () => {
    expect(await stores().playbooks.list()).toEqual([]);
    await stores().playbooks.publish(draft, "alice");
    await stores().playbooks.publish({ ...draft, markdown: "Updated steps" }, "bob");
    expect(await stores().playbooks.list()).toEqual([expect.stringContaining("Updated steps")]);
  });
  it("replaces Rules, including clearing deselected Rules, across instances", async () => {
    await stores().rules.replace(draft.id, [rule], "alice");
    expect(await stores().rules.all()).toEqual([rule]);
    await stores().rules.replace(draft.id, [{ ...rule, id: "new" }], "bob");
    expect((await stores().rules.all()).map((r) => r.id)).toEqual(["new"]);
    await stores().rules.replace(draft.id, []);
    expect(await stores().rules.all()).toEqual([]);
  });
  it("preserves safe ids exactly rather than re-slugging a published id", async () => {
    await stores().playbooks.publish({ ...draft, id: "deploy-" });
    expect(await stores().playbooks.list()).toEqual([expect.stringContaining("id: deploy-\n")]);
  });
  it("rejects invalid ids and malformed Playbooks and Rules before writing", async () => {
    await expect(stores().playbooks.publish({ ...draft, id: "../bad" })).rejects.toThrow(/Invalid Playbook id/);
    await expect(stores().rules.replace("../bad", [])).rejects.toThrow(/Invalid Playbook id/);
    await expect(stores().playbooks.publish({ ...draft, markdown: "" })).rejects.toThrow(/markdown/);
    await expect(stores().rules.replace(draft.id, [{ ...rule, check: { kind: "run_shell" } }])).rejects.toThrow(/valid Rules/);
    expect(await stores().playbooks.list()).toEqual([]);
    expect(await stores().rules.all()).toEqual([]);
  });
  it("persists and validates the versioned Journey cache across instances", async () => {
    expect(await stores().journeys.get()).toBeUndefined();
    await stores().journeys.put(journey);
    expect(await stores().journeys.get()).toEqual(journey);
    // @ts-expect-error Exercise storage validation for an incompatible cache version.
    await expect(stores().journeys.put({ ...journey, version: -1 })).rejects.toThrow(/out of date/);
    expect(await stores().journeys.get()).toEqual(journey);
  });
});

describe("Firestore documents", () => {
  it("records the verified publisher and update time on each write", async () => {
    const store = new FirestorePlaybookStore();
    await store.publish(draft, "alice");
    const ref = getDatabase().collection("playbooks").doc(draft.id);
    const first = (await ref.get()).data();
    expect(first).toMatchObject({ ownerUid: "alice", playbook: draft, updatedAt: expect.any(String) });
    expect(first).not.toHaveProperty("createdAt");
    await store.publish(draft, "bob");
    const second = (await ref.get()).data();
    expect(second).toMatchObject({ ownerUid: "bob" });
    expect(Date.parse(second?.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first?.updatedAt));
    await store.publish(draft);
    expect((await ref.get()).data()?.ownerUid).toBeNull();
  });
  it("skips invalid stored bodies instead of failing every reader", async () => {
    const db = getDatabase();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await new FirestorePlaybookStore().publish(draft);
      await new FirestoreRuleStore().replace(draft.id, [rule]);
      await db.collection("playbooks").doc("broken").set({ playbook: { ...draft, id: "broken", markdown: "" } });
      await db.collection("playbooks").doc("renamed").set({ playbook: draft });
      expect(await new FirestorePlaybookStore().list()).toEqual([expect.stringContaining("id: deploy\n")]);
      await db.collection("rules").doc("broken").set({ rules: [{ ...rule, check: { kind: "run_shell" } }] });
      expect(await new FirestoreRuleStore().all()).toEqual([rule]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("playbooks/broken"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("playbooks/renamed"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("rules/broken"));
    } finally { warn.mockRestore(); }
    await db.collection("journeys").doc(journeyCacheKey).set({ ...journey, version: "obsolete" });
    expect(await new FirestoreJourneyStore().get()).toBeUndefined();
  });
  it("serves repeated reads from memory until the store's next write", async () => {
    const db = getDatabase();
    const playbooks = new FirestorePlaybookStore(db);
    const rules = new FirestoreRuleStore(db);
    const reads = vi.spyOn(db, "collection");
    try {
      expect(await playbooks.list()).toEqual([]);
      expect(await rules.all()).toEqual([]);
      await db.collection("playbooks").doc(draft.id).set({ playbook: draft });
      await db.collection("rules").doc(draft.id).set({ rules: [rule] });
      reads.mockClear();
      expect(await playbooks.list()).toEqual([]);
      expect(await rules.all()).toEqual([]);
      expect(reads).not.toHaveBeenCalled();
      await playbooks.publish({ ...draft, markdown: "Updated steps" });
      await rules.replace(draft.id, [{ ...rule, id: "new" }]);
      expect(await playbooks.list()).toEqual([expect.stringContaining("Updated steps")]);
      expect((await rules.all()).map((r) => r.id)).toEqual(["new"]);
    } finally { reads.mockRestore(); }
  });
  it("keeps one shared Journey document rather than appending on every compile", async () => {
    const store = new FirestoreJourneyStore();
    await store.put(journey);
    await store.put({ ...journey, durationMs: 2 });
    expect((await getDatabase().collection("journeys").get()).docs).toHaveLength(1);
    expect((await store.get())?.durationMs).toBe(2);
  });
});

it("selects file stores by default and Firestore only when configured", () => {
  expect(createStores({}).playbookStore).toBeInstanceOf(FilePlaybookStore);
  expect(createStores({ STORE: "firestore" }).playbookStore).toBeInstanceOf(FirestorePlaybookStore);
  expect(createStores({ STORE: "firestore" }).ruleStore).toBeInstanceOf(FirestoreRuleStore);
  expect(createStores({ STORE: "firestore" }).journeyStore).toBeInstanceOf(FirestoreJourneyStore);
  expect(() => createStores({ STORE: "firsetore" })).toThrow(/STORE/);
});

it("keeps malformed file Journey data from being served", async () => {
  await writeFile(join(directory, `${journeyCacheKey}.json`), "{}");
  expect(await new FileJourneyStore(directory).get()).toBeUndefined();
  await rm(directory, { recursive: true, force: true });
});
