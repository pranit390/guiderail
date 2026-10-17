import { describe, expect, it } from "vitest";
import { buildDraftPrompt, DraftError, draftPlaybook, isRule, parseDraft } from "./draft.ts";
import type { TeachPayload } from "./types.ts";

const payload: TeachPayload = {
  goal: "Deploy a Cloud Run service our way",
  events: [
    { t: "navigate", at: 1, url: "console.cloud.google.com/run/create", title: "Create service" },
    { t: "field", at: 2, url: "console.cloud.google.com/run/create", target: { role: "combobox", name: "Region" }, value: "us-central1" },
    { t: "answer", at: 3, question: "Why us-central1?", text: "Always us-central1 unless it's an EU customer" },
    { t: "field", at: 4, url: "console.cloud.google.com/run", target: { role: "textbox", name: "Key 1", section: "Labels" }, value: "owner" },
  ],
};

const good = JSON.stringify({
  id: "cloud-run-deploy", title: "Deploy a Cloud Run service", appliesTo: ["console.cloud.google.com/run*"],
  goals: ["deploy"], markdown: "# Deploy\n1. Region us-central1 (EU customers: europe-west1).",
  suggestedRules: [{ id: "region-us", scope: { url: "console.cloud.google.com/iam-admin/*", section: "Grant access" },
    guide: { explain: "No owner grants", format: "a narrower role", examples: ["Cloud Run Developer"], suggest: null },
    check: { kind: "field_value_not_in", field: "Role", values: ["Owner"] }, severity: "warn", message: "Use a narrower role." }],
});

describe("buildDraftPrompt", () => {
  it("includes the goal, the expert's reasons and the events", () => {
    const p = buildDraftPrompt(payload);
    expect(p).toContain("Deploy a Cloud Run service our way");
    expect(p).toContain("Always us-central1 unless it's an EU customer");
    expect(p).toContain('"name":"Region"');
  });
  it("tells the model which sections Rules can fire in", () => {
    const p = buildDraftPrompt(payload);
    expect(p).toContain('"Labels"');
    expect(p).toContain('"Grant access"');
  });
});

describe("parseDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(parseDraft(good).id).toBe("cloud-run-deploy");
  });
  it("rejects non-JSON with a readable error", () => {
    expect(() => parseDraft("Sure! Here is your playbook")).toThrow(DraftError);
  });
  it("rejects a draft without markdown", () => {
    expect(() => parseDraft(JSON.stringify({ ...JSON.parse(good), markdown: "" }))).toThrow(/markdown/);
  });
  it("drops suggested rules whose check kind the engine can't run", () => {
    const d = JSON.parse(good);
    d.suggestedRules.push({ ...d.suggestedRules[0], id: "bad", check: { kind: "run_shell" } });
    expect(parseDraft(JSON.stringify(d)).suggestedRules.map((r) => r.id)).toEqual(["region-us"]);
  });
  it.each([["null", "null"], ["an array", "[]"], ["a number", "123"], ["a string", '"text"']])("rejects %s with a DraftError", (_n, raw) => {
    expect(() => parseDraft(raw)).toThrow(DraftError);
  });
  it("rejects a numeric title with a DraftError", () => {
    expect(() => parseDraft(JSON.stringify({ ...JSON.parse(good), title: 5 }))).toThrow(DraftError);
  });
  it("rejects a title that slugs to nothing", () => {
    expect(() => parseDraft(JSON.stringify({ ...JSON.parse(good), id: "", title: "!!!" }))).toThrow(/letters or numbers/);
  });
  it("drops a field_value_not_in rule without values", () => {
    const d = JSON.parse(good);
    d.suggestedRules[0].check = { kind: "field_value_not_in", field: "Region" };
    expect(parseDraft(JSON.stringify(d)).suggestedRules).toEqual([]);
  });
  it("drops a label_value_regex rule with an invalid pattern", () => {
    const d = JSON.parse(good);
    d.suggestedRules[0].check = { kind: "label_value_regex", key: "owner", pattern: "(" };
    expect(parseDraft(JSON.stringify(d)).suggestedRules).toEqual([]);
  });
  it("normalises a non-string guide.suggest to null", () => {
    const d = JSON.parse(good);
    d.suggestedRules[0].guide.suggest = 5;
    expect(parseDraft(JSON.stringify(d)).suggestedRules[0].guide.suggest).toBeNull();
  });
  it("slugs the id", () => {
    expect(parseDraft(JSON.stringify({ ...JSON.parse(good), id: "Cloud Run Deploy!" })).id).toBe("cloud-run-deploy");
  });
});

describe("isRule", () => {
  const base = () => JSON.parse(good).suggestedRules[0];
  it("accepts Rules scoped to Labels or Grant access", () => {
    expect(isRule(base())).toBe(true);
    expect(isRule({ ...base(), scope: { url: "console.cloud.google.com/*", section: "Labels" }, check: { kind: "label_required", key: "owner" } })).toBe(true);
  });
  it("drops a Rule scoped to a section the extension never checks", () => {
    expect(isRule({ ...base(), scope: { url: "console.cloud.google.com/run*", section: "Configure" } })).toBe(false);
  });
  it("drops a Rule whose scope.url is not a string", () => {
    expect(isRule({ ...base(), scope: { url: 5, section: "Labels" } })).toBe(false);
    expect(isRule({ ...base(), scope: { section: "Labels" } })).toBe(false);
  });
  it("parseDraft drops Rules in other sections", () => {
    const d = JSON.parse(good);
    d.suggestedRules.push({ ...d.suggestedRules[0], id: "cfg", scope: { url: "x*", section: "Configure" } });
    expect(parseDraft(JSON.stringify(d)).suggestedRules.map((r) => r.id)).toEqual(["region-us"]);
  });
});

describe("draftPlaybook", () => {
  it("calls the generator with the prompt and parses its output", async () => {
    let seen = "";
    const d = await draftPlaybook(payload, async (prompt) => ((seen = prompt), good));
    expect(seen).toContain("Deploy a Cloud Run service our way");
    expect(d.title).toBe("Deploy a Cloud Run service");
  });
});
