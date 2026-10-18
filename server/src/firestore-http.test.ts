import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { fakeFirestore } from "./testing/firestore.ts";
import { setTokenVerifier } from "./auth.ts";

vi.mock("./firestore.ts", async (original) => ({
  ...(await original<typeof import("./firestore.ts")>()),
  getDatabase: () => fakeFirestore,
}));

let base: string;
let server: (typeof import("./index.ts"))["server"];
beforeAll(async () => {
  vi.stubEnv("PORT", "0");
  vi.stubEnv("STORE", "firestore");
  vi.stubEnv("DISABLE_DRAFT", "false");
  vi.stubEnv("ALLOWED_EMAILS", "teacher@example.com");
  fakeFirestore.documents.clear();
  setTokenVerifier(async () => ({ uid: "teacher-uid", email: "teacher@example.com", emailVerified: true }));
  ({ server } = await import("./index.ts"));
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  setTokenVerifier();
  vi.unstubAllEnvs();
});

const rule = { id: "runtime-owner", scope: { url: "x*", section: "Labels" },
  guide: { explain: "Owner needed", format: "team", examples: [], suggest: null },
  check: { kind: "label_required", key: "owner" }, severity: "block", message: "Remember the owner" };
const draft = { id: "http-publish", title: "Deploy", markdown: "Published through HTTP", appliesTo: ["x*"], goals: ["deploy"], suggestedRules: [rule] };
const publish = (body: unknown, token = "token") => fetch(`${base}/playbooks`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "chrome-extension://abcdefghijklmnop", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

it("publishes to Firestore with the verified uid and reloads it into API and Live context", async () => {
  const seedPath = join(import.meta.dirname, "../../seed/rules/org-labeling-rules.json");
  const seedBefore = await readFile(seedPath, "utf8");
  expect((await publish({ draft, ruleIds: [rule.id], ownerUid: "spoofed" })).status).toBe(201);
  expect(fakeFirestore.documents.get(`playbooks/${draft.id}`)).toMatchObject({ ownerUid: "teacher-uid", playbook: draft });
  expect(fakeFirestore.documents.get(`rules/${draft.id}`)).toMatchObject({ ownerUid: "teacher-uid", rules: [rule] });
  // Preserve the existing shared catalogue and public read behavior.
  const listed = await (await fetch(`${base}/playbooks`)).json();
  expect(listed.playbooks).toContainEqual(expect.stringContaining(draft.markdown));
  const rules = await (await fetch(`${base}/rules`)).json();
  expect(rules.rules).toContainEqual(rule);
  expect(rules.rules).toContainEqual(expect.objectContaining({ id: "firestore-no-test-mode" }));
  const { loadPlaybooks, loadRuleLines } = await import("./playbooks/load.ts");
  expect(await loadPlaybooks()).toContainEqual(expect.stringContaining(draft.markdown));
  expect(await loadRuleLines()).toContain("Remember the owner (block)");
  expect(await readFile(seedPath, "utf8")).toBe(seedBefore);
  expect((await publish({ draft, ruleIds: [] })).status).toBe(201);
  expect(fakeFirestore.documents.get(`rules/${draft.id}`)?.rules).toEqual([]);
});

it("rejects malformed publishing input without writing", async () => {
  expect((await publish({ draft: { ...draft, id: "bad", appliesTo: [123] } })).status).toBe(400);
  expect((await publish({ draft: { ...draft, id: "bad", suggestedRules: [{ ...rule, check: { kind: "run_shell" } }] } })).status).toBe(400);
  expect(fakeFirestore.documents.has("playbooks/bad")).toBe(false);
});

it("requires authentication before publishing and retains the draft-disable gate", async () => {
  expect((await publish({ draft }, "")).status).toBe(401);
  vi.stubEnv("DISABLE_DRAFT", "true");
  try { expect((await publish({ draft })).status).toBe(503); }
  finally { vi.stubEnv("DISABLE_DRAFT", "false"); }
});
