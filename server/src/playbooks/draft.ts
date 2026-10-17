import { GoogleGenAI, Type } from "@google/genai";
import type { PlaybookDraft, Rule, TeachPayload } from "./types.ts";

export class DraftError extends Error {}
export type Generate = (prompt: string) => Promise<string>;

const RUNNABLE_CHECKS = new Set(["label_required", "label_value_enum", "label_value_regex", "label_all_regex", "field_value_not_in"]);

export function buildDraftPrompt(p: TeachPayload): string {
  return `An expert just showed how their org does this task in Google web tools.
Goal: ${p.goal}

Write a Playbook for guiding a new hire through the same task in the same UI.
- markdown: numbered steps naming the exact buttons, tabs and fields (as named in the events), where things are, the org's conventions WITH the expert's reasons, and quirks (e.g. a field that lives on a different page than expected).
- appliesTo: URL globs for the pages involved, like "console.cloud.google.com/run*".
- goals: short phrases a new hire might say.
- suggestedRules: only for values the expert set deliberately and explained (or set identically every time). Use only these check kinds: label_required {key}, label_value_enum {key, values}, label_value_regex {key, pattern}, label_all_regex {pattern}, field_value_not_in {field, values}. Use severity "warn" unless the expert said it's mandatory.
- Never invent steps that are not in the events.

Events (JSON, in order; "answer" is the expert's reply to a why-question):
${p.events.map((e) => JSON.stringify(e)).join("\n")}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function isRule(r: unknown): r is Rule {
  const x = r as Rule;
  return !!x && typeof x.id === "string" && !!x.scope?.url && !!x.guide && !!x.check && RUNNABLE_CHECKS.has(x.check.kind) &&
    (x.severity === "block" || x.severity === "warn") && typeof x.message === "string";
}

export function parseDraft(raw: string): PlaybookDraft {
  let d: Partial<PlaybookDraft>;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new DraftError("The model didn't return JSON for the Playbook draft.");
  }
  if (!d.title) throw new DraftError("The Playbook draft has no title.");
  if (!d.markdown) throw new DraftError("The Playbook draft has no markdown body.");
  return {
    id: slug(d.id || d.title),
    title: d.title,
    appliesTo: Array.isArray(d.appliesTo) ? d.appliesTo.map(String) : [],
    goals: Array.isArray(d.goals) ? d.goals.map(String) : [],
    markdown: d.markdown,
    suggestedRules: (Array.isArray(d.suggestedRules) ? d.suggestedRules : []).filter(isRule),
  };
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
            scope: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, section: { type: Type.STRING } } },
            guide: { type: Type.OBJECT, properties: { explain: { type: Type.STRING }, format: { type: Type.STRING },
              examples: { type: Type.ARRAY, items: { type: Type.STRING } }, suggest: { type: Type.STRING, nullable: true } } },
            check: { type: Type.OBJECT, properties: { kind: { type: Type.STRING }, key: { type: Type.STRING }, field: { type: Type.STRING },
              pattern: { type: Type.STRING }, values: { type: Type.ARRAY, items: { type: Type.STRING } } } },
          } } },
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
