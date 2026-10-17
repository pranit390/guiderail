export type Target = { role: string; name: string; section?: string };

export type TeachEvent =
  | { t: "click"; at: number; url: string; title: string; target: Target }
  | { t: "navigate"; at: number; url: string; title: string }
  | { t: "field"; at: number; url: string; target: Target; value: string }
  | { t: "narration"; at: number; text: string }
  | { t: "answer"; at: number; question: string; text: string };

export type TeachPayload = { goal: string; events: TeachEvent[] };

export type Rule = {
  id: string;
  scope: { url: string; section: string };
  guide: { explain: string; format: string; examples: string[]; suggest: string | null };
  check: Record<string, unknown> & { kind: string };
  severity: "block" | "warn";
  message: string;
};

export type PlaybookDraft = { id: string; title: string; appliesTo: string[]; goals: string[]; markdown: string; suggestedRules: Rule[] };
