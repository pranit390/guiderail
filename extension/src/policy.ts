// The policy engine. Plain code, no model calls, same answer every time (ADR 0002).
import type { FormState } from "./messages.ts";

export type Check =
  | { kind: "label_required"; key: string }
  | { kind: "label_value_enum"; key: string; values: string[] }
  | { kind: "label_value_regex"; key: string; pattern: string }
  | { kind: "label_all_regex"; pattern: string }
  | { kind: "field_value_not_in"; field: string; values: string[] }
  | { kind: "field_value_regex"; field: string; pattern: string }
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

/** Panel and page must agree: unique fields are primary (blocking = to fix, warn = to check), Rule count is secondary. */
export function summarizeViolations(violations: Pick<Violation, "field" | "severity">[]) {
  const blockingFields = [...new Set(violations.filter((v) => v.severity === "block").map((v) => v.field))];
  const checkFields = [...new Set(violations.filter((v) => v.severity === "warn" && !blockingFields.includes(v.field)).map((v) => v.field))];
  return { blockingFields, fixCount: blockingFields.length, checkCount: checkFields.length, ruleCount: violations.length };
}

/** One wording for the panel heading, the page toast and the model: e.g. "1 to fix · 1 to check (2 Rules)". */
export function violationCountText(summary: ReturnType<typeof summarizeViolations>): string {
  const parts = [summary.fixCount && `${summary.fixCount} to fix`, summary.checkCount && `${summary.checkCount} to check`].filter(Boolean);
  return `${parts.join(" · ")} (${summary.ruleCount} Rule${summary.ruleCount === 1 ? "" : "s"})`;
}

export type Context = { firstName?: string; consoleCreate: boolean };

const globToRegex = (glob: string) => new RegExp("^" + glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*"));

const fieldKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Field Rules match accessible names case-insensitively, with whitespace collapsed. */
export function fieldValue(form: Pick<FormState, "fields">, field: string): string | undefined {
  const key = fieldKey(field);
  return Object.entries(form.fields).find(([name]) => fieldKey(name) === key)?.[1];
}

const isFieldCheck = (c: Check): c is Extract<Check, { field: string }> => c.kind === "field_value_not_in" || c.kind === "field_value_regex";

// Label checks need their section on screen; field checks only need the field itself (they skip
// when it's absent). Guidance needs neither (a form may have no Labels field even though the
// resource still needs labels, e.g. Cloud Run's create form).
export function rulesFor(rules: Rule[], form: Pick<FormState, "url" | "sections">, section?: string, onScreen = true): Rule[] {
  return rules.filter(
    (r) =>
      globToRegex(r.scope.url).test(form.url) &&
      (!onScreen || isFieldCheck(r.check) || form.sections.includes(r.scope.section)) &&
      (!section || r.scope.section.toLowerCase() === section.toLowerCase()),
  );
}

// A section is on screen when the page shows it, or when a field its field Rules check is on the form.
export function sectionOnScreen(rules: Rule[], form: FormState, section: string): boolean {
  return (
    form.sections.includes(section) ||
    rulesFor(rules, form, section, false).some((r) => isFieldCheck(r.check) && fieldValue(form, r.check.field) !== undefined)
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
        const v = fieldValue(form, c.field);
        if (v && c.values.some((x) => x.toLowerCase() === v.toLowerCase())) fail(r, c.field);
        break;
      }
      case "field_value_regex": {
        const v = fieldValue(form, c.field);
        if (v && !new RegExp(c.pattern).test(v)) fail(r, c.field);
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
      const name = form.fields["Service name"] || Object.entries(form.fields).find(([k, v]) => v && /name/i.test(k))?.[1];
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
  for (const r of rulesFor(rules, form, section, false)) {
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
