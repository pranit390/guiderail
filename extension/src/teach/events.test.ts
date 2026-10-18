import { describe, expect, it } from "vitest";
import { compact, isSecretField, MASK, maskValue, MAX_EVENTS, type TeachEvent } from "./events.ts";

describe("maskValue", () => {
  it.each([
    ["sk-live-abcdefghijklmnopqrstuvwxyz123456"],
    ["AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456ghi789"],
    ["-----BEGIN PRIVATE KEY-----\nMIIE"],
    ["4f9a8c7e6d5b4a3928171615141312110f0e0d0c"],
    ["sk_live_abcdefgh12345678"],
    ["AKIAIOSFODNN7EXAMPLE"],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["xoxb-1234567890-abcdefghij"],
    ["Bearer abcdefghijklmnop"],
    ["postgres://admin:hunter2@db.internal:5432/app"],
  ])("masks %s", (secret) => expect(maskValue(secret)).toBe(MASK));

  it.each([
    ["export API_KEY=sk-live-abcdefghijklmnopqrstuvwxyz123456"],
    ["key is AIzaSyD-abcdefghijklmnopqrstuvwxyz12345 ok"],
    ["token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456ghi789"],
    ["curl -H 'Authorization: Bearer abcdefghijklmnop' https://x"],
    ["aws AKIAIOSFODNN7EXAMPLE us-east-1"],
    ["STRIPE=sk_test_abcdefgh12345678"],
    ["GH=ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["slack xoxp-1234567890-abcdefghij"],
    ["hash 4f9a8c7e6d5b4a3928171615141312110f0e0d0c here"],
    ["see https://user:pass@example.com/repo"],
  ])("masks a secret inside longer text: %s", (text) => expect(maskValue(text)).toBe(MASK));

  it.each([
    ["ocr-service"], ["us-central1"], ["pranit@example.com"], ["roles/run.developer"], ["Deploy OCR to prod"],
    ["us-docker.pkg.dev/zoop-innovation/cloud-run-source-deploy/ocr-service:latest"],
    ["Ask the task-scheduler-owner-team before deploying"],
    ["https://console.cloud.google.com/run/detail/us-central1/ocr-service"],
  ])(
    "keeps %s",
    (plain) => expect(maskValue(plain)).toBe(plain),
  );
});

describe("isSecretField", () => {
  it.each([
    [{ name: "Password" }], [{ name: "DB_PASS" }], [{ name: "Client secret" }], [{ name: "Access token" }],
    [{ name: "Credentials file" }], [{ name: "API key" }], [{ name: "api_key" }], [{ name: "Value 1", section: "Variables & Secrets" }],
    [{ name: "Value", section: "Secret Manager" }],
    ...["Recovery code", "Seed phrase", "recovery phrase", "mnemonic", "Session cookie", "Security answer", "Security question", "backup_code", "authentication-code", "auth code", "wallet phrase", "private  key", "client_secret"].map((name): [{ name: string }] => [{ name }]),
  ])("treats %j as secret", (t) => expect(isSecretField(t)).toBe(true));
  it.each([[{ name: "Service name" }], [{ name: "Value 1", section: "Labels" }], [{ name: "Region" }]])(
    "treats %j as plain",
    (t) => expect(isSecretField(t)).toBe(false),
  );
});

describe("compact", () => {
  const field = (n: number, value: string): TeachEvent => ({
    t: "field", at: n, url: "u", target: { role: "textbox", name: "Service name" }, value,
  });

  it("keeps only the last of consecutive field events on the same target", () => {
    const out = compact([field(1, "o"), field(2, "oc"), field(3, "ocr")]);
    expect(out).toEqual([field(3, "ocr")]);
  });

  it("caps a huge session at MAX_EVENTS and keeps the newest events", () => {
    const many: TeachEvent[] = Array.from({ length: 2000 }, (_, i) => ({ t: "navigate", at: i, url: `u${i}`, title: "" }));
    const out = compact(many);
    expect(out).toHaveLength(MAX_EVENTS);
    expect(out.at(-1)).toMatchObject({ at: 1999 });
  });
});
