import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UrlRetrievalStatus } from "@google/genai";
import { CompileError, FIRESTORE_GOAL, parseCompileRequest, parseJourneyDraft, type CompiledJourney } from "../../../shared/journey.ts";
import { JourneyCompiler, CompileAllowanceError, CompileDisabledError, guideJourneyInstruction, journeyInstruction, type GenerateJourney } from "./compile.ts";
import { FileJourneyStore, type JourneyStore } from "./store.ts";
import { fixtureDraft } from "./fixture.ts";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", async (original) => ({
  ...await original<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));

const response = () => ({ text: JSON.stringify(fixtureDraft), candidates: [{ urlContextMetadata: { urlMetadata: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS })) } }] });
function store(): JourneyStore {
  let value: CompiledJourney | undefined;
  return { async get() { return value; }, async put(journey) { value = journey; } };
}
describe("compile boundary", () => {
  it("serves cached Journeys in cost-limited mode without opening an unmetered provider call", async () => {
    const cache = store();
    const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
    const compiler = new JourneyCompiler(cache, generate);
    await expect(compiler.compile({ cachedOnly: true })).rejects.toBeInstanceOf(CompileDisabledError);
    expect(generate).not.toHaveBeenCalled();
    const first = await compiler.compile();
    generate.mockClear();
    expect(await compiler.compile({ cachedOnly: true })).toEqual({ ...first, cacheHit: true });
    expect(generate).not.toHaveBeenCalled();
  });
  it("charges the allowance only for a cache miss, and refuses without calling Gemini once it's used", async () => {
    const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
    const charge = vi.fn().mockReturnValue(false);
    await expect(new JourneyCompiler(store(), generate).compile({ charge })).rejects.toBeInstanceOf(CompileAllowanceError);
    expect(generate).not.toHaveBeenCalled();
    const cache = store();
    const compiler = new JourneyCompiler(cache, generate);
    charge.mockReturnValue(true);
    await compiler.compile({ charge });
    expect(charge).toHaveBeenCalledTimes(2);
    await compiler.compile({ charge });
    expect(charge).toHaveBeenCalledTimes(2);
  });

  it("reports an unreadable cache as a compile error without spending provider quota", async () => {
    const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
    const cache = { get: vi.fn().mockRejectedValue(new Error("EACCES")), put: vi.fn() };
    await expect(new JourneyCompiler(cache, generate).compile()).rejects.toMatchObject({ constructor: CompileError, message: expect.stringContaining("Couldn't read the Journey cache") });
    expect(generate).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
  it("reports a failed cache write as a compile error instead of returning an uncached success", async () => {
    const cache = { get: async () => undefined, put: vi.fn().mockRejectedValue(new Error("EACCES")) };
    await expect(new JourneyCompiler(cache, async () => response()).compile()).rejects.toMatchObject({ constructor: CompileError, message: expect.stringContaining("Couldn't save the compiled Journey") });
  });
  it("sends the validated fixture's citation heading to the provider for Steps and Test mode", async () => {
    generateContent.mockResolvedValue(response());
    await new JourneyCompiler(store()).compile();
    const draft = parseJourneyDraft(fixtureDraft);
    for (const item of [...draft.steps, draft.testModeWarning]) {
      expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({ contents: expect.stringContaining(`steps and Test mode warning = "${item.citationHeading}"`) }));
    }
  });
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
  it("recompiles instead of serving a Journey cached under the previous source contract", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guiderail-compile-"));
    try {
      const previous = { ...FIRESTORE_GOAL, version: 2 };
      const staleKey = createHash("sha256").update(JSON.stringify(previous)).digest("hex");
      const cite = (c: { citationHeading: string }) => c.citationHeading === "Create a database" ? { ...c, citationHeading: "Firebase console" } : c;
      const stale = { ...fixtureDraft, steps: fixtureDraft.steps.map(cite), testModeWarning: cite(fixtureDraft.testModeWarning),
        consoleUrl: FIRESTORE_GOAL.consoleUrl, version: 2, compiledAt: "2026-10-17T23:00:00Z", durationMs: 100,
        retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) };
      await writeFile(join(dir, `${staleKey}.json`), JSON.stringify(stale));
      const generate = vi.fn<GenerateJourney>().mockResolvedValue(response());
      const result = await new JourneyCompiler(new FileJourneyStore(dir), generate).compile();
      expect(result.cacheHit).toBe(false);
      expect(generate).toHaveBeenCalledTimes(1);
      expect([...result.journey.steps, result.journey.testModeWarning].map((c) => c.citationHeading)).not.toContain("Firebase console");
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
