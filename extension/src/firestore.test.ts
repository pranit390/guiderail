// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import seed from "../../seed/rules/org-labeling-rules.json";
import type { FormState } from "./messages.ts";
import { evaluate, type Rule } from "./policy.ts";
import { isRule } from "../../server/src/playbooks/draft.ts";
import { FIRESTORE_LOCATIONS_DOC, firestoreGuardStatus, renderFirestoreGuidance } from "./firestore.ts";

const seedRules: unknown[] = seed.rules;
// The server validates the JSON boundary; its broad Check type needs narrowing for the extension evaluator.
const rules = seedRules.filter(isRule) as Rule[];
const form = (fields: FormState["fields"] = {}): FormState => ({
  url: "console.firebase.google.com/project/practice-only/firestore", labels: {}, sections: [], fields,
});
const test = { "Start in test mode": "checked", "Start in production mode": "" };
const production = { "Start in test mode": "", "Start in production mode": "checked" };

describe("Firestore deterministic Rule and guidance", () => {
  it("loads one valid Firebase seed Rule, scoped to the exact host", () => {
    expect(rules.filter((rule) => rule.id === "firestore-no-test-mode")).toHaveLength(1);
    expect(evaluate(rules, form(test))).toEqual([expect.objectContaining({ field: "Start in test mode", severity: "block" })]);
    for (const url of ["mail.google.com/", "console.cloud.google.com/run/create", "console.firebase.google.com.evil.test/project/a/firestore", "other.test/console.firebase.google.com/project/a/firestore"]) {
      expect(evaluate(rules, { ...form(test), url })).toEqual([]);
      expect(firestoreGuardStatus({ ...form(test), url })).toBeNull();
    }
    expect(evaluate(rules, form(production))).toEqual([]);
  });

  it.each<FormState["fields"]>([{}, { "Start in test mode": "checked" }, { "Test mode": "checked" }, { ...test, "Start in production mode": "checked" }, { ...test, "Start in test mode": "" }])("reports absent, renamed or mismatched controls as unknown: %j", (fields) => {
    expect(firestoreGuardStatus(form(fields))).toBe("unknown");
    const region = document.createElement("section");
    renderFirestoreGuidance(region, form(fields));
    expect(region.hidden).toBe(false);
    expect(region.textContent).toContain("Security mode not checked");
    expect(region.textContent).not.toContain("all checks passed");
  });

  it("keeps source-linked location guidance before Create across Test, Production and unknown", () => {
    const region = document.createElement("section");
    for (const [fields, status] of [[test, "test"], [production, "production"], [{}, "unknown"]] as const) {
      expect(firestoreGuardStatus(form(fields))).toBe(status);
      renderFirestoreGuidance(region, form(fields));
      expect(region.textContent).toContain("location cannot be changed after creation");
      expect(region.querySelector(`a[href="${FIRESTORE_LOCATIONS_DOC}"]`)?.textContent).toBe("Cloud Firestore locations");
      expect(region.textContent).toContain("second click within 10 seconds");
    }
    expect(region.textContent).not.toContain("all checks passed");
    renderFirestoreGuidance(region, { ...form(), url: "mail.google.com/mail" });
    expect(region.hidden).toBe(true);
    expect(region.childNodes).toHaveLength(0);
  });
});
