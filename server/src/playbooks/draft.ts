import { GoogleGenAI, Type } from "@google/genai";
import type { PlaybookDraft, Rule, TeachPayload } from "./types.ts";

export class DraftError extends Error {}
export type Generate = (prompt: string) => Promise<string>;

const RUNNABLE_CHECKS = new Set(["label_required", "label_value_enum", "label_value_regex", "label_all_regex", "field_value_not_in", "field_value_regex"]);

export function buildDraftPrompt(p: TeachPayload): string {
  return `An expert just showed how their org does this task in Google web tools.
Goal: ${p.goal}

Write a Playbook for guiding a new hire through the same task in the same UI.
- markdown: numbered steps naming the exact buttons, tabs and fields (as named in the events), where things are, the org's conventions WITH the expert's reasons, and quirks (e.g. a field that lives on a different page than expected).
- appliesTo: URL globs for the pages involved, like "console.cloud.google.com/run*".
- goals: short phrases a new hire might say.
- suggestedRules: one for every value the expert set deliberately and explained (or set identically every time) that can be checked on the page. Use only these check kinds: label_required {key}, label_value_enum {key, values}, label_value_regex {key, pattern}, label_all_regex {pattern}, field_value_not_in {field, values}, field_value_regex {field, pattern}.
  - field is the field's name exactly as in the events. A radio button or checkbox is its own field whose value is "checked" when selected, so "never pick Allow unauthenticated" is field_value_not_in {field: "Allow unauthenticated", values: ["checked"]}.
  - A naming pattern is field_value_regex with an anchored pattern, e.g. ^[a-z]+-[a-z0-9-]+-service$ for <department>-<app>-service.
  - Skip choices that depend on the situation (e.g. a region that depends on where the customer is); those stay in the markdown.
  - Use severity "block" when the expert said it's mandatory or used words like must, never or always; otherwise "warn".
- Every suggested rule needs scope {url, section}: url is the page glob, section is the heading the field sits under. label_* checks must use section "Labels".
- Never invent steps that are not in the events.

Events (JSON, in order; "answer" is the expert's reply to a why-question):
${p.events.map((e) => JSON.stringify(e)).join("\n")}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export const isSafeId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const compiles = (p: unknown) => {
  if (!isStr(p)) return false;
  try { new RegExp(p); return true; } catch { return false; }
};

function validCheck(c: Record<string, unknown>): boolean {
  switch (c.kind) {
    case "label_required": return isStr(c.key);
    case "label_value_enum": return isStr(c.key) && isStrArray(c.values);
    case "label_value_regex": return isStr(c.key) && compiles(c.pattern);
    case "label_all_regex": return compiles(c.pattern);
    case "field_value_not_in": return isStr(c.field) && isStrArray(c.values);
    case "field_value_regex": return isStr(c.field) && compiles(c.pattern);
    default: return false;
  }
}

export function isRule(r: unknown): r is Rule {
  const x = r as Rule;
  if (!x || typeof x !== "object" || !isStr(x.id) || !x.scope || typeof x.scope !== "object") return false;
  if (!isStr(x.scope.url) || !x.scope.url || !isStr(x.scope.section)) return false;
  // The extension only reads labels inside the Labels section, so a label Rule anywhere else could never fire.
  if (x.check && isStr(x.check.kind) && x.check.kind.startsWith("label_") && x.scope.section !== "Labels") return false;
  if (!x.guide || !isStr(x.guide.explain) || !isStr(x.guide.format) || !isStrArray(x.guide.examples)) return false;
  if (!x.check || typeof x.check !== "object" || !RUNNABLE_CHECKS.has(x.check.kind) || !validCheck(x.check)) return false;
  if (!(x.severity === "block" || x.severity === "warn") || !isStr(x.message)) return false;
  if (!isStr(x.guide.suggest)) x.guide.suggest = null;
  return true;
}

export function parseDraft(raw: string): PlaybookDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DraftError("The model didn't return JSON for the Playbook draft.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DraftError("The model returned JSON, but not a Playbook draft object.");
  }
  const d = parsed as Record<string, unknown>;
  if (!isStr(d.title) || !d.title) throw new DraftError("The Playbook draft has no title.");
  if (!isStr(d.markdown) || !d.markdown) throw new DraftError("The Playbook draft has no markdown body.");
  const id = slug(String(d.id ?? "") || d.title);
  if (!id) throw new DraftError("The Playbook draft needs a title with letters or numbers.");
  return {
    id,
    title: d.title,
    appliesTo: Array.isArray(d.appliesTo) ? d.appliesTo.map(String) : [],
    goals: Array.isArray(d.goals) ? d.goals.map(String) : [],
    markdown: d.markdown,
    suggestedRules: (Array.isArray(d.suggestedRules) ? d.suggestedRules : []).filter(isRule),
  };
}

// Publishing and storage are stricter than model drafting: never silently drop malformed Rules.
export function parseRules(value: unknown): Rule[] {
  if (!Array.isArray(value) || !value.every(isRule)) throw new DraftError("Rules must be an array of valid Rules.");
  return value;
}

export function parsePlaybook(value: unknown): PlaybookDraft {
  if (!value || typeof value !== "object" || !("id" in value) ||
      !isSafeId(value.id)) {
    throw new DraftError("Invalid Playbook id.");
  }
  if (!("appliesTo" in value) || !isStrArray(value.appliesTo) ||
      !("goals" in value) || !isStrArray(value.goals) || !("suggestedRules" in value)) {
    throw new DraftError("The draft needs appliesTo, goals and suggestedRules arrays.");
  }
  parseRules(value.suggestedRules);
  return { ...parseDraft(JSON.stringify(value)), id: value.id };
}

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT ?? "zoop-innovation",
  location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
});

const geminiGenerate: Generate = async (prompt) => {
  const res = await ai.models.generateContent({
    model: process.env.DRAFT_MODEL ?? "gemini-3.8-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING }, title: { type: Type.STRING }, markdown: { type: Type.STRING },
          appliesTo: { type: Type.ARRAY, items: { type: Type.STRING } },
          goals: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedRules: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            id: { type: Type.STRING }, severity: { type: Type.STRING }, message: { type: Type.STRING },
            scope: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, section: { type: Type.STRING } }, required: ["url", "section"] },
            guide: { type: Type.OBJECT, properties: { explain: { type: Type.STRING }, format: { type: Type.STRING },
              examples: { type: Type.ARRAY, items: { type: Type.STRING } }, suggest: { type: Type.STRING, nullable: true } },
              required: ["explain", "format", "examples"] },
            check: { type: Type.OBJECT, properties: { kind: { type: Type.STRING }, key: { type: Type.STRING }, field: { type: Type.STRING },
              pattern: { type: Type.STRING }, values: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["kind"] },
          }, required: ["id", "severity", "message", "scope", "guide", "check"] } },
        },
        required: ["id", "title", "markdown", "appliesTo", "goals", "suggestedRules"],
      },
    },
  });
  return res.text ?? "";
};

export async function draftPlaybook(p: TeachPayload, generate: Generate = geminiGenerate): Promise<PlaybookDraft> {
  return parseDraft(await generate(buildDraftPrompt(p)));
}
