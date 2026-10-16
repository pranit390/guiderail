// The policy engine. Plain code, no model calls, same answer every time (ADR 0002).
import type { FormState } from "./messages.ts";

export type Check =
  | { kind: "label_required"; key: string }
  | { kind: "label_value_enum"; key: string; values: string[] }
  | { kind: "label_value_regex"; key: string; pattern: string }
  | { kind: "label_all_regex"; pattern: string }
  | { kind: "field_value_not_in"; field: string; values: string[] }
  | { kind: "llm_judge"; key: string; question: string }
  | { kind: "element_interaction"; text: string };

export type Rule = {
  id: string;
  scope: { url: string; section: string };
  guide: { explain: string; format: string; examples: string[]; suggest: string | null };
  check: Check;
  severity: "block" | "warn";
  message: string;
};

export type Violation = { ruleId: string; field: string; message: string; severity: Rule["severity"] };

export type Suggestion = { key: string; explain: string; format: string; examples: string[]; suggested: string | null; ask: boolean };

export type Context = { firstName?: string; consoleCreate: boolean };

const globToRegex = (glob: string) => new RegExp("^" + glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*"));

export function rulesFor(rules: Rule[], form: Pick<FormState, "url" | "sections">, section?: string): Rule[] {
  return rules.filter(
    (r) =>
      globToRegex(r.scope.url).test(form.url) &&
      form.sections.includes(r.scope.section) &&
      (!section || r.scope.section.toLowerCase() === section.toLowerCase()),
  );
}

export function evaluate(rules: Rule[], form: FormState): Violation[] {
  const out: Violation[] = [];
  const fail = (r: Rule, field: string) => out.push({ ruleId: r.id, field, message: r.message, severity: r.severity });

  for (const r of rulesFor(rules, form)) {
    const c = r.check;
    switch (c.kind) {
      case "label_required":
        if (!form.labels[c.key]) fail(r, `label:${c.key}`);
        break;
      case "label_value_enum": {
        const v = form.labels[c.key];
        if (v && !c.values.includes(v)) fail(r, `label:${c.key}`);
        break;
      }
      case "label_value_regex": {
        const v = form.labels[c.key];
        if (v && !new RegExp(c.pattern).test(v)) fail(r, `label:${c.key}`);
        break;
      }
      case "label_all_regex": {
        const re = new RegExp(c.pattern);
        const bad = Object.entries(form.labels).find(([k, v]) => !re.test(k) || (v !== "" && !re.test(v)));
        if (bad) fail(r, `label:${bad[0]}`);
        break;
      }
      case "field_value_not_in": {
        const v = form.fields[c.field];
        if (v && c.values.some((x) => x.toLowerCase() === v.toLowerCase())) fail(r, c.field);
        break;
      }
      // llm_judge and element_interaction need the server or a click watcher; not checked here yet.
    }
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);

function suggest(source: string | null, form: FormState, ctx: Context): string | null {
  switch (source) {
    case "user.firstName": return ctx.firstName ? slug(ctx.firstName) : null;
    case "form.serviceName": {
      const name = form.fields["Service name"] ?? Object.entries(form.fields).find(([k]) => /name/i.test(k))?.[1];
      return name ? slug(name) : null;
    }
    case "resource.type": return /\/run\//.test(form.url) ? "api" : null;
    case "context.consoleCreate→manual": return ctx.consoleCreate ? "manual" : null;
    default: return null;
  }
}

// What to tell the user before they fill a section in: one entry per label key.
export function guidance(rules: Rule[], form: FormState, ctx: Context, section = "Labels"): Suggestion[] {
  const byKey = new Map<string, Suggestion>();
  for (const r of rulesFor(rules, form, section)) {
    const key = "key" in r.check ? r.check.key : null;
    if (!key) continue;
    const s = byKey.get(key) ?? { key, explain: "", format: "", examples: [], suggested: null, ask: false };
    if (r.check.kind === "label_required") s.explain = r.guide.explain;
    if (r.check.kind === "label_value_enum" || r.check.kind === "label_value_regex" || !s.format) s.format = r.guide.format;
    s.examples = [...new Set([...s.examples, ...r.guide.examples])];
    if (r.guide.suggest === "ask") s.ask = true;
    s.suggested ??= suggest(r.guide.suggest, form, ctx);
    byKey.set(key, s);
  }
  return [...byKey.values()];
}
