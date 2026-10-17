import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UrlRetrievalStatus } from "@google/genai";
import { FIRESTORE_GOAL, parseCompileRequest, parseJourneyDraft, type CompiledJourney } from "../../../shared/journey.ts";
import { JourneyCompiler, guideJourneyInstruction, journeyInstruction, type GenerateJourney } from "./compile.ts";
import { FileJourneyStore, type JourneyStore } from "./store.ts";
import { fixtureDraft } from "./fixture.ts";

const response = () => ({ text: JSON.stringify(fixtureDraft), candidates: [{ urlContextMetadata: { urlMetadata: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS })) } }] });
function store(): JourneyStore {
  let value: CompiledJourney | undefined;
  return { async get() { return value; }, async put(journey) { value = journey; } };
}
describe("compile boundary", () => {
  it("accepts only the pinned catalog Goal ID", () => {
    expect(parseCompileRequest({ goalId: FIRESTORE_GOAL.id })).toBe(FIRESTORE_GOAL.id);
    for (const value of [{ goalId: "other" }, { goalId: FIRESTORE_GOAL.id, url: "https://example.com" }, {}, null, []]) expect(() => parseCompileRequest(value)).toThrow();
  });
  it("compiles single-control cited Steps, persists them and returns a cache hit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guiderail-compile-"));
    try {
      const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
      const first = await new JourneyCompiler(new FileJourneyStore(dir), generate).compile();
      expect(first.cacheHit).toBe(false);
      expect(first.journey.steps.map((s) => s.control)).toEqual([...fixtureDraft.steps.map((s) => s.control)]);
      expect(first.journey.retrieval).toHaveLength(2);
      const second = await new JourneyCompiler(new FileJourneyStore(dir), generate).compile();
      expect(second).toEqual({ ...first, cacheHit: true });
      expect(generate).toHaveBeenCalledTimes(1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("coalesces simultaneous requests into one bounded provider call", async () => {
    const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
    const compiler = new JourneyCompiler(store(), generate);
    await Promise.all([compiler.compile(), compiler.compile(), compiler.compile()]);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed JSON and does not cache it", async () => {
    const cache = store();
    await expect(new JourneyCompiler(cache, async () => ({ text: "not json" })).compile()).rejects.toThrow("valid JSON");
    expect(await cache.get()).toBeUndefined();
  });
  it.each([undefined, UrlRetrievalStatus.URL_RETRIEVAL_STATUS_ERROR, UrlRetrievalStatus.URL_RETRIEVAL_STATUS_UNSPECIFIED])("refuses missing/unsuccessful relied-on retrieval %s", async (status) => {
    const result = response();
    result.candidates[0].urlContextMetadata.urlMetadata = status === undefined ? [] : [{ retrievedUrl: FIRESTORE_GOAL.sourceUrls[0], urlRetrievalStatus: status }];
    await expect(new JourneyCompiler(store(), async () => result).compile()).rejects.toThrow("retrieve");
  });
  it("does not accept retrieval status invented in model JSON", async () => {
    await expect(new JourneyCompiler(store(), async () => ({ text: JSON.stringify({ ...fixtureDraft, retrieval: response().candidates[0].urlContextMetadata.urlMetadata }) })).compile()).rejects.toThrow("retrieve");
  });
  it.each([
    { ...fixtureDraft, method: "gcloud" },
    { ...fixtureDraft, steps: fixtureDraft.steps.slice(1) },
    { ...fixtureDraft, steps: fixtureDraft.steps.map((s, i) => i === 0 ? { ...s, control: "Databases & Storage → Firestore" } : s) },
    { ...fixtureDraft, steps: fixtureDraft.steps.map((s, i) => i === 0 ? { ...s, citationHeading: "" } : s) },
    { ...fixtureDraft, steps: fixtureDraft.steps.map((s, i) => i === 0 ? { ...s, sourceUrl: "https://example.com" } : s) },
    { ...fixtureDraft, steps: fixtureDraft.steps.map((s, i) => i === 0 ? { ...s, explanation: "Run gcloud firestore databases create" } : s) },
    { ...fixtureDraft, prerequisite: {} },
    { ...fixtureDraft, locationWarning: { ...fixtureDraft.locationWarning, citationHeading: "An invented heading" } },
    { ...fixtureDraft, testModeWarning: { ...fixtureDraft.testModeWarning, explanation: "Safe for production" } },
    { ...fixtureDraft, locationWarning: { ...fixtureDraft.locationWarning, explanation: "Change later" } },
  ])("rejects incomplete or mixed-method output %#", (invalid) => expect(() => parseJourneyDraft(invalid)).toThrow());
  it("injects vendor facts separately with citations and a live-page mismatch instruction", async () => {
    const { journey } = await new JourneyCompiler(store(), async () => response()).compile();
    const instruction = journeyInstruction(journey);
    expect(instruction).toContain("not company Policy");
    expect(instruction).toContain("I can't see it on this screen");
    expect(instruction).toContain(FIRESTORE_GOAL.sourceUrls[0]);
    expect(instruction).toContain("The person clicks Create");
  });
});

describe("Guide Journey context", () => {
  it("appends the cached Journey only for the catalog Goal", async () => {
    const cached = store();
    await cached.put((await new JourneyCompiler(cached, vi.fn<GenerateJourney>().mockResolvedValue(response())).compile()).journey);
    expect(await guideJourneyInstruction(FIRESTORE_GOAL.id, cached)).toContain("Documentation-derived Journey");
    expect(await guideJourneyInstruction(undefined, cached)).toBeUndefined();
  });
  it("falls back to plain Guide with a diagnostic when the cache can't be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: JourneyStore = { async get() { throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }); }, async put() {} };
    expect(await guideJourneyInstruction(FIRESTORE_GOAL.id, broken)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
    warn.mockRestore();
  });
});
