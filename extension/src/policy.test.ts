import { describe, expect, it } from "vitest";
import seed from "../../seed/rules/org-labeling-rules.json";
import type { FormState } from "./messages.ts";
import { evaluate, guidance, rulesFor, summarizeViolations, type Rule, type Violation } from "./policy.ts";

const rules = seed.rules as Rule[];

const validLabels = {
  environment: "dev",
  application: "ocr-service",
  component: "api",
  owner: "pranit",
  "managed-by": "manual",
};

const cloudRun = (labels: Record<string, string>, fields: Record<string, string> = {}): FormState => ({
  url: "console.cloud.google.com/run/create",
  labels,
  fields,
  sections: ["Labels"],
});

const ids = (violations: Violation[]) => violations.map((violation) => violation.ruleId);

describe("rulesFor", () => {
  it("matches console.cloud.google.com URL globs and skips other hosts", () => {
    const matched = rulesFor(rules, { url: "console.cloud.google.com/run/create", sections: ["Labels"] });
    expect(matched.map((rule) => rule.id)).toContain("label-required-environment");
    expect(matched.every((rule) => rule.scope.url.startsWith("console.cloud.google.com/"))).toBe(true);

    expect(rulesFor(rules, { url: "mail.google.com", sections: ["Labels"] })).toEqual([]);
  });

  it("filters by section", () => {
    const form = { url: "console.cloud.google.com/iam-admin/iam", sections: ["Labels", "Grant access"] };

    const labels = rulesFor(rules, form, "Labels");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((rule) => rule.scope.section === "Labels")).toBe(true);

    expect(rulesFor(rules, form, "Grant access").map((rule) => rule.id)).toEqual(["iam-no-owner"]);
    expect(rulesFor(rules, { url: "console.cloud.google.com/run/create", sections: ["Labels"] }, "Grant access")).toEqual([]);
  });
});

describe("evaluate", () => {
  it("blocks the five required labels when a Cloud Run form has none", () => {
    const violations = evaluate(rules, cloudRun({}));
    const blocks = violations.filter((violation) => violation.severity === "block");

    expect(blocks).toHaveLength(5);
    expect(ids(blocks).sort()).toEqual([
      "label-required-application",
      "label-required-component",
      "label-required-environment",
      "label-required-managed-by",
      "label-required-owner",
    ]);
  });

  it("flags environment=production as env-enum", () => {
    const violations = evaluate(rules, cloudRun({ ...validLabels, environment: "production" }));
    expect(ids(violations)).toEqual(["env-enum"]);
    expect(violations[0]?.severity).toBe("block");
  });

  it("flags an email owner as owner-format and label-format", () => {
    const violations = evaluate(rules, cloudRun({ ...validLabels, owner: "pranit@example.com" }));
    expect(ids(violations).sort()).toEqual(["label-format", "owner-format"]);
    expect(violations.every((violation) => violation.severity === "block")).toBe(true);
  });

  it("flags managed-by=pranit as managed-by-enum", () => {
    const violations = evaluate(rules, cloudRun({ ...validLabels, "managed-by": "pranit" }));
    expect(ids(violations)).toEqual(["managed-by-enum"]);
    expect(violations[0]?.severity).toBe("block");
  });

  it("flags a KYC_API key as label-format", () => {
    const violations = evaluate(rules, cloudRun({ ...validLabels, KYC_API: "ocr-service" }));
    expect(ids(violations)).toEqual(["label-format"]);
    expect(violations[0]).toMatchObject({ field: "label:KYC_API", severity: "block" });
  });

  it("accepts a fully valid Cloud Run label set", () => {
    const violations = evaluate(rules, cloudRun(validLabels));
    expect(violations.filter((violation) => violation.severity === "block")).toEqual([]);
  });

  it("warns only when component is outside the preferred set", () => {
    const violations = evaluate(rules, cloudRun({ ...validLabels, component: "service" }));
    expect(violations).toEqual([
      expect.objectContaining({ ruleId: "component-preferred", field: "label:component", severity: "warn" }),
    ]);
  });

  it("blocks Owner on an IAM grant and allows a narrower role", () => {
    const iam = (role: string): FormState => ({
      url: "console.cloud.google.com/iam-admin/iam",
      labels: {},
      fields: { Role: role },
      sections: ["Grant access"],
    });

    const owner = evaluate(rules, iam("Owner"));
    expect(owner).toEqual([expect.objectContaining({ ruleId: "iam-no-owner", field: "Role", severity: "block" })]);
    expect(evaluate(rules, iam("Cloud Run Developer"))).toEqual([]);
  });
});

describe("summarizeViolations", () => {
  it("counts unique fields primary and Rules secondary (panel/page agreement)", () => {
    const vs: Violation[] = [
      { ruleId: "a", field: "label:owner", message: "m1", severity: "block" },
      { ruleId: "b", field: "label:owner", message: "m2", severity: "block" },
      { ruleId: "c", field: "label:environment", message: "m3", severity: "warn" },
    ];
    expect(summarizeViolations(vs)).toEqual({ fields: ["label:owner", "label:environment"], fieldCount: 2, ruleCount: 3, blockingFields: ["label:owner"], blockingFieldCount: 1, blockingRuleCount: 2 });
    expect(summarizeViolations([])).toMatchObject({ fieldCount: 0, ruleCount: 0 });
  });
});

describe("guidance", () => {
  it("returns one Labels entry per key, with suggestions from the form and context", () => {
    const suggestions = guidance(
      rules,
      cloudRun({}, { "Service name": "OCR Service" }),
      { firstName: "Pranit", consoleCreate: true },
      "Labels",
    );

    expect(suggestions.map((suggestion) => suggestion.key)).toEqual([
      "environment",
      "application",
      "component",
      "owner",
      "managed-by",
    ]);

    const byKey = Object.fromEntries(suggestions.map((suggestion) => [suggestion.key, suggestion]));
    expect(byKey.owner?.suggested).toBe("pranit");
    expect(byKey["managed-by"]?.suggested).toBe("manual");
    expect(byKey.application?.suggested).toBe("ocr-service");
    expect(byKey.environment).toMatchObject({ ask: true, suggested: null });
  });

  it("still returns the label policy when the page has no Labels section (real Cloud Run create form)", () => {
    const form: FormState = { url: "console.cloud.google.com/run/create", labels: {}, fields: { "Service name": "ocr-service" }, sections: [] };
    const keys = guidance(rules, form, { firstName: "Pranit", consoleCreate: true }, "Labels").map((s) => s.key);
    expect(keys).toEqual(["environment", "application", "component", "owner", "managed-by"]);
  });

  it("returns nothing for pages outside the Rules' URL scope", () => {
    const form: FormState = { url: "mail.google.com/mail/compose", labels: {}, fields: {}, sections: [] };
    expect(guidance(rules, form, { consoleCreate: false }, "Labels")).toEqual([]);
  });
});
