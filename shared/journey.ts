// Vendor guidance is a reusable template, never company Policy or live-page evidence.
export const FIRESTORE_GOAL = {
  id: "create-firestore-database",
  title: "Create a Firestore database",
  method: "firebase-console",
  consoleUrl: "https://console.firebase.google.com/project/_/firestore/databases",
  sourceUrls: [
    "https://firebase.google.com/docs/firestore/manage-databases",
    "https://firebase.google.com/docs/firestore/manage-databases.md.txt",
    "https://firebase.google.com/docs/firestore/locations.md.txt",
  ],
  version: 2,
} as const;

export const STEP_CONTROLS = ["Databases & Storage", "Firestore", "Add database", "Standard edition", "Next", "Database ID", "Location", "Next", "Production mode", "Create"] as const;
export type Citation = { sourceUrl: string; citationHeading: string; explanation: string };
export type JourneyDraft = {
  goalId: typeof FIRESTORE_GOAL.id;
  method: typeof FIRESTORE_GOAL.method;
  steps: (Citation & { control: string })[];
  prerequisite: Citation & { role: "roles/datastore.owner"; permission: "datastore.databases.create" };
  databaseIdGuidance: Citation;
  limitations: Citation;
  testModeWarning: Citation;
  locationWarning: Citation;
};
export type Retrieval = { retrievedUrl: string; urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" };
export type CompiledJourney = JourneyDraft & {
  consoleUrl: typeof FIRESTORE_GOAL.consoleUrl;
  version: typeof FIRESTORE_GOAL.version;
  compiledAt: string;
  durationMs: number;
  retrieval: Retrieval[];
};
export type CompileResult = { journey: CompiledJourney; cacheHit: boolean };
export class CompileError extends Error {}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompileError("Expected a Journey object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new CompileError(`Missing or invalid ${label}.`);
  return value.trim();
}
function citation(value: unknown): Citation {
  const v = record(value);
  const sourceUrl = text(v.sourceUrl, "source URL", 300);
  if (!FIRESTORE_GOAL.sourceUrls.some((url) => url === sourceUrl)) throw new CompileError("The Journey cited an unapproved source URL.");
  const explanation = text(v.explanation, "explanation");
  if (/\bgcloud\b|\bCLI\b|\bTerraform\b|console\.cloud\.google\.com/i.test(explanation)) throw new CompileError("The Journey mixed Firebase console and other methods. Retry compilation.");
  const citationHeading = text(v.citationHeading, "citation heading", 160);
  const headings = sourceUrl === FIRESTORE_GOAL.sourceUrls[2]
    ? ["Cloud Firestore locations", "Types of locations", "Multi-region locations", "Regional locations"]
    : ["Manage databases", "Required roles and permissions", "Create a database", "Firebase console", "Database ID", "Limitations"];
  if (!headings.includes(citationHeading)) throw new CompileError("The citation heading is outside the pinned source contract.");
  return { sourceUrl, citationHeading, explanation };
}
export function parseJourneyDraft(value: unknown): JourneyDraft {
  const v = record(value);
  if (v.goalId !== FIRESTORE_GOAL.id) throw new CompileError("Unknown Goal. Choose Create a Firestore database.");
  if (v.method !== FIRESTORE_GOAL.method) throw new CompileError("Only the Firebase console method is supported.");
  if (!Array.isArray(v.steps) || v.steps.length !== STEP_CONTROLS.length) throw new CompileError("The Journey must cover all seven source beats with navigation and Next split into separate Steps.");
  const steps = v.steps.map((item: unknown, i: number) => {
    const step = record(item);
    if (step.control !== STEP_CONTROLS[i]) throw new CompileError(`Step ${i + 1} must name only ${STEP_CONTROLS[i]}.`);
    return { ...citation(step), control: STEP_CONTROLS[i] };
  });
  const p = record(v.prerequisite);
  if (p.role !== "roles/datastore.owner" || p.permission !== "datastore.databases.create") throw new CompileError("The Cloud Datastore Owner prerequisite is missing.");
  const databaseIdGuidance = citation(v.databaseIdGuidance);
  const limitations = citation(v.limitations);
  const testModeWarning = citation(v.testModeWarning);
  const locationWarning = citation(v.locationWarning);
  if (!databaseIdGuidance.explanation.includes("(default)") || !/4/.test(databaseIdGuidance.explanation) || !/63/.test(databaseIdGuidance.explanation) || !/UUID/i.test(databaseIdGuidance.explanation) || !/5|five/i.test(databaseIdGuidance.explanation)) throw new CompileError("Database ID guidance must include constraints, the default ID and reuse delay.");
  if (!/anyone/i.test(testModeWarning.explanation) || !/read/i.test(testModeWarning.explanation) || !/overwrite/i.test(testModeWarning.explanation)) throw new CompileError("The Test mode warning is missing.");
  if (!/cannot|can't|immutable|permanent/i.test(locationWarning.explanation)) throw new CompileError("The immutable-location warning is missing.");
  if (locationWarning.sourceUrl !== FIRESTORE_GOAL.sourceUrls[2]) throw new CompileError("Location guidance must cite the locations source.");
  return { goalId: FIRESTORE_GOAL.id, method: FIRESTORE_GOAL.method, steps,
    prerequisite: { ...citation(p), role: "roles/datastore.owner", permission: "datastore.databases.create" },
    databaseIdGuidance, limitations, testModeWarning, locationWarning };
}
export function parseCompiledJourney(value: unknown): CompiledJourney {
  const v = record(value);
  const draft = parseJourneyDraft(v);
  if (v.consoleUrl !== FIRESTORE_GOAL.consoleUrl || v.version !== FIRESTORE_GOAL.version) throw new CompileError("The compiled Journey is out of date. Retry compilation.");
  if (typeof v.durationMs !== "number" || !Number.isFinite(v.durationMs) || v.durationMs < 0 || typeof v.compiledAt !== "string" || !Number.isFinite(Date.parse(v.compiledAt))) throw new CompileError("Missing compilation metadata.");
  if (!Array.isArray(v.retrieval)) throw new CompileError("Missing source retrieval metadata.");
  const retrieval = v.retrieval.map((entry: unknown): Retrieval => {
    const r = record(entry);
    if (typeof r.retrievedUrl !== "string" || !FIRESTORE_GOAL.sourceUrls.some((url) => url === r.retrievedUrl) || r.urlRetrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS") throw new CompileError("A relied-on source was not retrieved successfully.");
    return { retrievedUrl: r.retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" };
  });
  const reliedOn = [...draft.steps, draft.prerequisite, draft.databaseIdGuidance, draft.limitations, draft.testModeWarning, draft.locationWarning];
  if (reliedOn.some((c) => !retrieval.some((r) => r.retrievedUrl === c.sourceUrl))) throw new CompileError("A relied-on source was not retrieved successfully.");
  return { ...draft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, compiledAt: v.compiledAt, durationMs: v.durationMs, retrieval };
}
export function parseCompileResult(value: unknown): CompileResult {
  const v = record(value);
  if (typeof v.cacheHit !== "boolean") throw new CompileError("Missing cache status.");
  return { journey: parseCompiledJourney(v.journey), cacheHit: v.cacheHit };
}
export function parseCompileRequest(value: unknown): typeof FIRESTORE_GOAL.id {
  const v = record(value);
  if (Object.keys(v).length !== 1 || v.goalId !== FIRESTORE_GOAL.id) throw new CompileError("Send only the catalog Goal ID: create-firestore-database. URLs are not accepted.");
  return FIRESTORE_GOAL.id;
}
