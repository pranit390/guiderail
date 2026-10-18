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
const form = (fields: FormState["fields"] = {}, sections = ["Create a database"]): FormState => ({
  url: "console.firebase.google.com/project/practice-only/firestore", labels: {}, sections, fields,
});
const test = { "Start in test mode": "checked", "Start in Production mode": "" };
const production = { "Start in test mode": "", "Start in Production mode": "checked" };

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

  it.each<FormState["fields"]>([{}, { "Start in test mode": "checked" }, { "Test mode": "checked" }, { ...test, "Start in Production mode": "checked" }, { ...test, "Start in test mode": "" }])("reports absent, renamed or mismatched controls as unknown: %j", (fields) => {
    expect(firestoreGuardStatus(form(fields))).toBe("unknown");
    const region = document.createElement("section");
    renderFirestoreGuidance(region, form(fields));
    expect(region.hidden).toBe(false);
    expect(region.textContent).toContain("Security mode not checked");
    expect(region.textContent).not.toContain("all checks passed");
  });

  it("matches the observed console labels case-insensitively with whitespace collapsed", () => {
    const fields = { "start in  TEST mode ": "checked", " Start in production   mode": "" };
    expect(firestoreGuardStatus(form(fields, []))).toBe("test");
    expect(evaluate(rules, form(fields, []))).toEqual([expect.objectContaining({ ruleId: "firestore-no-test-mode", severity: "block" })]);
    expect(firestoreGuardStatus(form({ "START IN TEST MODE": "", "start in production mode": "checked" }, []))).toBe("production");
  });

  it("shows nothing on Firestore pages without the create wizard", () => {
    const region = document.createElement("section");
    renderFirestoreGuidance(region, form(test));
    expect(region.hidden).toBe(false);
    for (const url of ["console.firebase.google.com/project/practice-only/firestore", "console.firebase.google.com/project/practice-only/firestore/databases/-default-/data", "console.firebase.google.com/project/practice-only/firestore/rules"]) {
      const browsing = { ...form({ "Search documents": "" }, []), url };
      expect(firestoreGuardStatus(browsing)).toBeNull();
      renderFirestoreGuidance(region, browsing);
      expect(region.hidden).toBe(true);
      expect(region.childNodes).toHaveLength(0);
    }
    expect(firestoreGuardStatus(form({}, ["Create a database"]))).toBe("unknown");
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
