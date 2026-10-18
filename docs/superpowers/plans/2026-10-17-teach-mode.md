# Teach Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an expert perform a task in any Google web tool while GuideRail records and asks "why?", turn that into a Playbook (and suggested Rules) the expert publishes, and use it to guide new hires.

**Architecture:** The content script records meaning-level events (click / navigate / field) with secrets masked; the side panel collects them into a Teach session alongside the expert's transcribed speech, using a Live session in `teach` mode that only listens and asks "why?". On Stop, the server asks `gemini-3.8-flash` for a JSON Playbook draft, the expert publishes it, and published Playbooks/Rules are stored as local files behind store interfaces, loaded into every Guide-mode Live session and the extension's Rule set.

**Tech Stack:** TypeScript, Chrome MV3 extension (esbuild), Node server (`ws`, `@google/genai` on Vertex via ADC), vitest (+ `happy-dom` for DOM tests).

**Spec:** `docs/superpowers/specs/2026-10-17-teach-mode-design.md`

## Global Constraints

- GuideRail never clicks, types or sends for the user, in either mode (ADR 0001). Teach mode has **no tools**.
- Rules stay deterministic JSON checked by `extension/src/policy.ts` (ADR 0002). Teach mode only *suggests* Rules; the expert confirms.
- Vertex only, via ADC locally: project `zoop-innovation`, location `us-central1`, Live model `gemini-live-2.5-flash-native-audio`, draft model `gemini-3.8-flash`. No API keys.
- Never read `input[type=password]` or password-autocomplete fields. Mask secret-looking values as `«masked»`.
- Max 500 events per Teach session; consecutive `field` events on the same target keep only the last.
- No company-specific names in repo files (use "the org", `example.com`, `PROJECT_ID`).
- Local storage only for now: `data/` (gitignored) behind `PlaybookStore` / `RuleStore`.
- Server runs on `http://localhost:8787`; extension talks to it there.

## Review Focus

1. **Secrets in recordings**: an expert pastes an API key or token into a field. Expect `«masked»` in the event and in the draft. (Tests in Task 2 and Task 3.)
2. **Recording GuideRail's own UI**: clicks inside the `guiderail-overlay` element must not become events. (Test in Task 3.)
3. **Gemini returns malformed or partial JSON**: the draft endpoint must answer 502 with a readable message, not crash or publish junk. (Test in Task 4.)
4. **Huge sessions**: 2,000 raw events (typing, scrolling around) must compact to ≤ 500 and keep the latest field values. (Test in Task 2.)
5. **Publishing the same Playbook twice**: same id overwrites rather than duplicating, and its suggested Rules are replaced, not appended. (Test in Task 5.)

---

## File Structure

| File | Responsibility |
|---|---|
| `extension/src/page.ts` (new) | Describe DOM elements: `nameOf`, `roleOf`, `sectionOf`, `isSecret`, `textOf`, `effectiveUrl`, `findSection`. Shared by guiding and recording. |
| `extension/src/content.ts` (modify) | Import from `page.ts`; route `teach` on/off to the recorder. |
| `extension/src/teach/events.ts` (new) | `TeachEvent` type, `maskValue`, `compact`. Pure. |
| `extension/src/teach/recorder.ts` (new) | DOM listeners that turn expert actions into `TeachEvent`s. |
| `extension/src/teach/session.ts` (new) | `TeachSession`: collects events + narration, builds the payload. Pure. |
| `extension/src/messages.ts` (modify) | New `teach` / `teach_event` messages. |
| `extension/src/sidepanel.ts`, `extension/public/sidepanel.html`, `extension/public/panel.css` (modify) | Teach button, recording indicator, draft review, publish; Rules fetched from server. |
| `server/src/playbooks/types.ts` (new) | `TeachEvent`, `TeachPayload`, `PlaybookDraft`, `Rule` (server copies). |
| `server/src/playbooks/draft.ts` (new) | Prompt building, Gemini call, JSON parsing/validation. |
| `server/src/playbooks/store.ts` (new) | `PlaybookStore`, `RuleStore`, file implementations. |
| `server/src/live.ts` (modify) | `mode` (guide / teach), per-session instruction with seed + published Playbooks. |
| `server/src/index.ts` (modify) | `/playbooks/draft`, `/playbooks`, merged `/rules`, `?mode=` on `/live`. |
| `sandbox/cloud-run-create.html` (modify), `sandbox/cloud-run-services.html` (new) | Match the real console: no Labels on create; Services list with Info panel Labels tab. |
| `CONTEXT.md`, `docs/pitch.md`, `docs/adr/0006-knowledge-from-expert-recordings.md` | Language, Act 0, decision record. |

---

### Task 1: Extract element-description helpers into `page.ts`

**Files:**
- Create: `extension/src/page.ts`
- Modify: `extension/src/content.ts` (remove the moved functions, import them)
- Test: `extension/src/page.test.ts`

**Interfaces:**
- Produces: `textOf(el: Element | null): string`, `nameOf(el: Element): string`, `roleOf(el: Element): string`, `sectionOf(el: Element): string | undefined`, `isSecret(el: Element): boolean`, `effectiveUrl(): string`, `findSection(title: string): Element | null`, `INTERACTIVE: string`, `allElements(root?): Element[]`, `norm(s: string): string`.

- [ ] **Step 1: Add happy-dom**

Run: `npm install -D happy-dom -w extension`

- [ ] **Step 2: Write the failing test** — `extension/src/page.test.ts`

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { findSection, isSecret, nameOf, roleOf, sectionOf } from "./page.ts";

beforeEach(() => {
  document.body.innerHTML = `
    <label for="svc">Service name</label><input id="svc" value="ocr-service">
    <input type="password" id="pw" aria-label="Password">
    <section aria-labelledby="labels-h"><h3 id="labels-h">Labels</h3>
      <input aria-label="Key 1"><input aria-label="Value 1"></section>
    <div role="tablist"><div role="tab" aria-selected="true" aria-controls="p1">Labels</div></div>
    <div role="tabpanel" id="p1"><input aria-label="Key 1"></div>
    <h3>Containers, networking, security</h3>`;
});

describe("page helpers", () => {
  it("names inputs by their label element", () => {
    expect(nameOf(document.getElementById("svc")!)).toBe("Service name");
  });
  it("treats h3 as a heading", () => {
    expect(roleOf(document.querySelector("h3")!)).toBe("heading");
  });
  it("finds the section of an input in an aria-labelledby section", () => {
    const key = document.querySelector('section input[aria-label="Key 1"]')!;
    expect(sectionOf(key)).toBe("Labels");
  });
  it("flags password fields as secret", () => {
    expect(isSecret(document.getElementById("pw")!)).toBe(true);
  });
  it("finds a section by heading text", () => {
    expect(findSection("Labels")?.tagName).toBe("SECTION");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w extension -- page.test.ts`
Expected: FAIL, `Cannot find module './page.ts'`.

- [ ] **Step 4: Create `extension/src/page.ts`** by moving these from `content.ts` unchanged and exporting them: `INTERACTIVE`, `effectiveUrl`, `allElements`, `isVisible`, `textOf`, `nameOf`, `roleOf`, `sectionOf`, `isSecret`, `norm`, `findSection`. Then in `content.ts` delete those definitions and add:

```ts
import { allElements, effectiveUrl, findSection, INTERACTIVE, isSecret, isVisible, nameOf, norm, roleOf, sectionOf, textOf } from "./page.ts";
```

(Drop any name from the import that `content.ts` no longer uses so `tsc` stays clean.)

- [ ] **Step 5: Teach `findSection` about selected tabs** (the real Cloud Run Info panel puts Labels in a tab). In `page.ts`, make `findSection`:

```ts
export function findSection(title: string): Element | null {
  const heading = allElements().find((el) => roleOf(el) === "heading" && norm(textOf(el)) === norm(title));
  if (heading) return heading.closest("section,fieldset,[role=region]") ?? heading.parentElement;
  const tab = [...document.querySelectorAll('[role=tab][aria-selected="true"]')].find((t) => norm(textOf(t)) === norm(title));
  const panelId = tab?.getAttribute("aria-controls");
  if (panelId) return document.getElementById(panelId);
  return document.querySelector(`section[aria-label="${title}"],[role=region][aria-label="${title}"]`);
}
```

and add to the test file:

```ts
it("finds a section that is a selected tab's panel", () => {
  document.querySelector("section")!.remove();
  expect(findSection("Labels")?.id).toBe("p1");
});
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -w extension && npx tsc -p extension && npm run build -w extension`
Expected: all tests PASS (13 existing + 6 new), no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add extension/package.json package-lock.json extension/src/page.ts extension/src/page.test.ts extension/src/content.ts
git commit -m "Extract page description helpers and find sections in selected tabs"
```

---

### Task 2: Teach events, secret masking and compaction

**Files:**
- Create: `extension/src/teach/events.ts`
- Test: `extension/src/teach/events.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Target = { role: string; name: string; section?: string };
  export type TeachEvent =
    | { t: "click"; at: number; url: string; title: string; target: Target }
    | { t: "navigate"; at: number; url: string; title: string }
    | { t: "field"; at: number; url: string; target: Target; value: string }
    | { t: "narration"; at: number; text: string }
    | { t: "answer"; at: number; question: string; text: string };
  export const MASK = "«masked»";
  export const MAX_EVENTS = 500;
  export function maskValue(value: string): string;
  export function compact(events: TeachEvent[], max?: number): TeachEvent[];
  ```

- [ ] **Step 1: Write the failing test** — `extension/src/teach/events.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { compact, MASK, maskValue, MAX_EVENTS, type TeachEvent } from "./events.ts";

describe("maskValue", () => {
  it.each([
    ["sk-live-abcdefghijklmnopqrstuvwxyz123456"],
    ["AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456ghi789"],
    ["-----BEGIN PRIVATE KEY-----\nMIIE"],
    ["4f9a8c7e6d5b4a3928171615141312110f0e0d0c"],
  ])("masks %s", (secret) => expect(maskValue(secret)).toBe(MASK));

  it.each([["ocr-service"], ["us-central1"], ["pranit@example.com"], ["roles/run.developer"], ["Deploy OCR to prod"]])(
    "keeps %s",
    (plain) => expect(maskValue(plain)).toBe(plain),
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w extension -- events.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `extension/src/teach/events.ts`**

```ts
// What a Teach session records. Elements are described by meaning, never by position or CSS.
export type Target = { role: string; name: string; section?: string };

export type TeachEvent =
  | { t: "click"; at: number; url: string; title: string; target: Target }
  | { t: "navigate"; at: number; url: string; title: string }
  | { t: "field"; at: number; url: string; target: Target; value: string }
  | { t: "narration"; at: number; text: string }
  | { t: "answer"; at: number; question: string; text: string };

export const MASK = "«masked»";
export const MAX_EVENTS = 500;

const SECRET_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{16,}/, // API secret keys
  /^AIza[0-9A-Za-z_-]{20,}/, // Google API keys
  /^eyJ[\w-]+\.[\w-]+\.[\w-]+/, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM
  /^[A-Fa-f0-9]{32,}$/, // long hex tokens
  /^[A-Za-z0-9+/=_-]{40,}$/, // long base64-ish tokens with no spaces
];

export function maskValue(value: string): string {
  return SECRET_PATTERNS.some((p) => p.test(value.trim())) ? MASK : value;
}

const sameTarget = (a: TeachEvent, b: TeachEvent) =>
  a.t === "field" && b.t === "field" && a.url === b.url && a.target.name === b.target.name && a.target.section === b.target.section;

export function compact(events: TeachEvent[], max = MAX_EVENTS): TeachEvent[] {
  const out: TeachEvent[] = [];
  for (const e of events) {
    const last = out.at(-1);
    if (last && sameTarget(last, e)) out[out.length - 1] = e;
    else out.push(e);
  }
  return out.length > max ? out.slice(-max) : out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w extension -- events.test.ts`
Expected: PASS (12 cases).

- [ ] **Step 5: Commit**

```bash
git add extension/src/teach/events.ts extension/src/teach/events.test.ts
git commit -m "Add Teach events with secret masking and compaction"
```

---

### Task 3: Content-script recorder

**Files:**
- Create: `extension/src/teach/recorder.ts`
- Modify: `extension/src/messages.ts`, `extension/src/content.ts`
- Test: `extension/src/teach/recorder.test.ts`

**Interfaces:**
- Consumes: `nameOf`, `roleOf`, `sectionOf`, `isSecret`, `effectiveUrl` (Task 1); `TeachEvent`, `Target`, `maskValue` (Task 2).
- Produces: `startRecording(emit: (e: TeachEvent) => void): void`, `stopRecording(): void`, `describe(el: Element): Target`. Messages: `ToPage` gains `{ kind: "teach"; on: boolean }`; `FromPage` gains `{ kind: "teach_event"; event: TeachEvent }`.

- [ ] **Step 1: Write the failing test** — `extension/src/teach/recorder.test.ts`

```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeachEvent } from "./events.ts";
import { startRecording, stopRecording } from "./recorder.ts";

let events: TeachEvent[];

beforeEach(() => {
  document.body.innerHTML = `
    <button>Create service</button>
    <label for="svc">Service name</label><input id="svc">
    <label for="tok">Token</label><input id="tok">
    <input type="password" id="pw" aria-label="Password">
    <guiderail-overlay><button id="ours">Copy</button></guiderail-overlay>`;
  events = [];
  startRecording((e) => events.push(e));
});
afterEach(() => stopRecording());

const change = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("recorder", () => {
  it("records a click with the element's meaning", () => {
    document.querySelector("button")!.click();
    expect(events[0]).toMatchObject({ t: "click", target: { role: "button", name: "Create service" } });
  });
  it("records field changes by label", () => {
    change("svc", "ocr-service");
    expect(events[0]).toMatchObject({ t: "field", target: { name: "Service name" }, value: "ocr-service" });
  });
  it("masks secret-looking values", () => {
    change("tok", "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345");
    expect(events[0]).toMatchObject({ t: "field", value: "«masked»" });
  });
  it("never records password fields", () => {
    change("pw", "hunter2");
    expect(events).toHaveLength(0);
  });
  it("ignores clicks on GuideRail's own overlay", () => {
    document.getElementById("ours")!.click();
    expect(events).toHaveLength(0);
  });
  it("stops recording", () => {
    stopRecording();
    document.querySelector("button")!.click();
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w extension -- recorder.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `extension/src/teach/recorder.ts`**

```ts
// Records what the expert does, by meaning. Never reads passwords; masks secret-looking values.
import { effectiveUrl, isSecret, nameOf, roleOf, sectionOf } from "../page.ts";
import { maskValue, type Target, type TeachEvent } from "./events.ts";

const CLICKABLE = 'button,a[href],summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],h1,h2,h3,h4';

let emit: ((e: TeachEvent) => void) | null = null;
let lastUrl = "";
let timer: ReturnType<typeof setInterval> | undefined;

export function describe(el: Element): Target {
  const target: Target = { role: roleOf(el), name: nameOf(el) };
  const section = sectionOf(el);
  if (section && section !== target.name) target.section = section;
  return target;
}

const ours = (el: Element) => !!el.closest("guiderail-overlay");

function onClick(e: Event) {
  const el = (e.target as Element).closest(CLICKABLE);
  if (!emit || !el || ours(el)) return;
  emit({ t: "click", at: Date.now(), url: effectiveUrl(), title: document.title, target: describe(el) });
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (!emit || ours(el) || isSecret(el) || !("value" in el)) return;
  const value = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent?.trim() ?? el.value : el.value;
  emit({ t: "field", at: Date.now(), url: effectiveUrl(), target: describe(el), value: maskValue(value) });
}

export function startRecording(send: (e: TeachEvent) => void) {
  emit = send;
  lastUrl = location.href;
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  timer = setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    emit?.({ t: "navigate", at: Date.now(), url: effectiveUrl(), title: document.title });
  }, 500);
}

export function stopRecording() {
  emit = null;
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("change", onChange, true);
  clearInterval(timer);
}
```

- [ ] **Step 4: Add the messages** — in `extension/src/messages.ts`:

```ts
import type { TeachEvent } from "./teach/events.ts";
```

add `| { kind: "teach"; on: boolean }` to `ToPage` and `| { kind: "teach_event"; event: TeachEvent }` to `FromPage`.

- [ ] **Step 5: Wire it in `content.ts`** — import and handle the message:

```ts
import { startRecording, stopRecording } from "./teach/recorder.ts";
```

In the `chrome.runtime.onMessage` switch add:

```ts
case "teach":
  if (msg.on) startRecording((event) => send({ kind: "teach_event", event }));
  else stopRecording();
  reply({ ok: true });
  break;
```

- [ ] **Step 6: Run tests, typecheck, build**

Run: `npm test -w extension && npx tsc -p extension && npm run build -w extension`
Expected: all PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add extension/src/teach/recorder.ts extension/src/teach/recorder.test.ts extension/src/messages.ts extension/src/content.ts
git commit -m "Record expert clicks, fields and navigation in Teach mode"
```

---

### Task 4: Server Playbook drafting (prompt, Gemini call, parsing)

**Files:**
- Create: `server/src/playbooks/types.ts`, `server/src/playbooks/draft.ts`
- Modify: `server/package.json` (vitest + test script)
- Test: `server/src/playbooks/draft.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type Target = { role: string; name: string; section?: string };
  export type TeachEvent = /* identical union to extension/src/teach/events.ts */;
  export type TeachPayload = { goal: string; events: TeachEvent[] };
  export type Rule = { id: string; scope: { url: string; section: string }; guide: { explain: string; format: string; examples: string[]; suggest: string | null }; check: Record<string, unknown> & { kind: string }; severity: "block" | "warn"; message: string };
  export type PlaybookDraft = { id: string; title: string; appliesTo: string[]; goals: string[]; markdown: string; suggestedRules: Rule[] };
  // draft.ts
  export function buildDraftPrompt(p: TeachPayload): string;
  export function parseDraft(raw: string): PlaybookDraft; // throws DraftError
  export class DraftError extends Error {}
  export type Generate = (prompt: string) => Promise<string>;
  export async function draftPlaybook(p: TeachPayload, generate?: Generate): Promise<PlaybookDraft>;
  ```

- [ ] **Step 1: Add vitest to the server**

Run: `npm install -D vitest -w server`, then add `"test": "vitest run"` to `server/package.json` scripts.

- [ ] **Step 2: Create `server/src/playbooks/types.ts`** with exactly the types in the Interfaces block (copy the `TeachEvent` union verbatim from Task 2).

- [ ] **Step 3: Write the failing test** — `server/src/playbooks/draft.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildDraftPrompt, DraftError, draftPlaybook, parseDraft } from "./draft.ts";
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
  suggestedRules: [{ id: "region-us", scope: { url: "console.cloud.google.com/run/create*", section: "Configure" },
    guide: { explain: "Default region", format: "us-central1", examples: ["us-central1"], suggest: null },
    check: { kind: "field_value_not_in", field: "Region", values: ["asia-south1"] }, severity: "warn", message: "Use us-central1." }],
});

describe("buildDraftPrompt", () => {
  it("includes the goal, the expert's reasons and the events", () => {
    const p = buildDraftPrompt(payload);
    expect(p).toContain("Deploy a Cloud Run service our way");
    expect(p).toContain("Always us-central1 unless it's an EU customer");
    expect(p).toContain('"name":"Region"');
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
  it("slugs the id", () => {
    expect(parseDraft(JSON.stringify({ ...JSON.parse(good), id: "Cloud Run Deploy!" })).id).toBe("cloud-run-deploy");
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
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, module `./draft.ts` not found.

- [ ] **Step 5: Implement `server/src/playbooks/draft.ts`**

```ts
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
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -w server && npx tsc -p server`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/package.json package-lock.json server/src/playbooks/types.ts server/src/playbooks/draft.ts server/src/playbooks/draft.test.ts
git commit -m "Draft Playbooks from Teach sessions with Gemini"
```

---

### Task 5: Playbook and Rule stores, HTTP routes

**Files:**
- Create: `server/src/playbooks/store.ts`
- Modify: `server/src/index.ts`, `.gitignore` (add `data/`)
- Test: `server/src/playbooks/store.test.ts`

**Interfaces:**
- Consumes: `PlaybookDraft`, `Rule`, `draftPlaybook`, `DraftError` (Task 4).
- Produces:
  ```ts
  export interface PlaybookStore { publish(d: PlaybookDraft): Promise<void>; list(): Promise<string[]>; } // list returns markdown docs with frontmatter
  export interface RuleStore { replace(playbookId: string, rules: Rule[]): Promise<void>; all(): Promise<Rule[]>; }
  export class FilePlaybookStore implements PlaybookStore { constructor(dir: string) }
  export class FileRuleStore implements RuleStore { constructor(dir: string) }
  export function toMarkdown(d: PlaybookDraft): string;
  ```
  Routes: `POST /playbooks/draft` body `TeachPayload` → 200 `PlaybookDraft` | 400 | 502 `{error}`; `POST /playbooks` body `{ draft: PlaybookDraft, ruleIds: string[] }` → 201 `{id}`; `GET /playbooks` → `{ playbooks: string[] }`; `GET /rules` → `{ rules: Rule[] }` (seed + published).

- [ ] **Step 1: Write the failing test** — `server/src/playbooks/store.test.ts`

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilePlaybookStore, FileRuleStore, toMarkdown } from "./store.ts";
import type { PlaybookDraft, Rule } from "./types.ts";

const rule = (id: string): Rule => ({ id, scope: { url: "x*", section: "Labels" }, guide: { explain: "", format: "", examples: [], suggest: null },
  check: { kind: "label_required", key: "owner" }, severity: "warn", message: "m" });
const draft: PlaybookDraft = { id: "cloud-run-deploy", title: "Deploy", appliesTo: ["console.cloud.google.com/run*"], goals: ["deploy"], markdown: "# Deploy\n1. Step", suggestedRules: [] };

describe("stores", () => {
  it("writes markdown with frontmatter", () => {
    expect(toMarkdown(draft)).toMatch(/^---\nid: cloud-run-deploy\n/);
  });
  it("overwrites a Playbook published twice under the same id", async () => {
    const s = new FilePlaybookStore(mkdtempSync(join(tmpdir(), "pb-")));
    await s.publish(draft);
    await s.publish({ ...draft, markdown: "# Deploy v2" });
    const all = await s.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toContain("# Deploy v2");
  });
  it("replaces, not appends, a Playbook's Rules", async () => {
    const r = new FileRuleStore(mkdtempSync(join(tmpdir(), "rules-")));
    await r.replace("cloud-run-deploy", [rule("a"), rule("b")]);
    await r.replace("cloud-run-deploy", [rule("c")]);
    expect((await r.all()).map((x) => x.id)).toEqual(["c"]);
  });
  it("returns nothing from an empty directory that doesn't exist yet", async () => {
    expect(await new FilePlaybookStore(join(tmpdir(), "missing-" + Date.now())).list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server -- store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/playbooks/store.ts`**

```ts
// Local file stores for published Playbooks and Rules. Firestore can replace these behind the same interfaces.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaybookDraft, Rule } from "./types.ts";

export interface PlaybookStore { publish(d: PlaybookDraft): Promise<void>; list(): Promise<string[]> }
export interface RuleStore { replace(playbookId: string, rules: Rule[]): Promise<void>; all(): Promise<Rule[]> }

export const toMarkdown = (d: PlaybookDraft) =>
  `---\nid: ${d.id}\nappliesTo: ${JSON.stringify(d.appliesTo)}\ngoals: ${JSON.stringify(d.goals)}\nsource: teach\n---\n\n${d.markdown}\n`;

async function readAll(dir: string, ext: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(files.filter((f) => f.endsWith(ext)).sort().map((f) => readFile(join(dir, f), "utf8")));
}

export class FilePlaybookStore implements PlaybookStore {
  constructor(private dir: string) {}
  async publish(d: PlaybookDraft) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${d.id}.md`), toMarkdown(d));
  }
  list() { return readAll(this.dir, ".md"); }
}

export class FileRuleStore implements RuleStore {
  constructor(private dir: string) {}
  async replace(playbookId: string, rules: Rule[]) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${playbookId}.json`), JSON.stringify({ playbookId, rules }, null, 2));
  }
  async all() {
    return (await readAll(this.dir, ".json")).flatMap((s) => (JSON.parse(s) as { rules: Rule[] }).rules);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server`
Expected: PASS (10 tests).

- [ ] **Step 5: Add routes to `server/src/index.ts`**

Near the top, after existing imports:

```ts
import { draftPlaybook, DraftError } from "./playbooks/draft.ts";
import { FilePlaybookStore, FileRuleStore } from "./playbooks/store.ts";
import type { PlaybookDraft, TeachPayload } from "./playbooks/types.ts";

export const playbookStore = new FilePlaybookStore(join(ROOT, "data", "playbooks"));
export const ruleStore = new FileRuleStore(join(ROOT, "data", "rules"));
```

Replace the existing `/rules` handler with a merged one, and add the Playbook routes before the sandbox handler (use the existing `readJson` helper):

```ts
if (url.pathname === "/rules") {
  const seed = JSON.parse(await readFile(join(ROOT, "seed", "rules", "org-labeling-rules.json"), "utf8"));
  res.setHeader("Content-Type", "application/json");
  return void res.end(JSON.stringify({ rules: [...seed.rules, ...(await ruleStore.all())] }));
}

if (url.pathname === "/playbooks/draft" && req.method === "POST") {
  const body = (await readJson(req)) as TeachPayload | undefined;
  if (!body?.goal || !Array.isArray(body.events) || body.events.length === 0) {
    return void res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Send a goal and at least one event." }));
  }
  try {
    const draft = await draftPlaybook(body);
    return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(draft));
  } catch (err) {
    const status = err instanceof DraftError ? 502 : 500;
    return void res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (err as Error).message }));
  }
}

if (url.pathname === "/playbooks" && req.method === "POST") {
  const body = (await readJson(req)) as { draft?: PlaybookDraft; ruleIds?: string[] } | undefined;
  if (!body?.draft?.id || !body.draft.markdown) {
    return void res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Send the draft to publish." }));
  }
  const keep = new Set(body.ruleIds ?? []);
  await playbookStore.publish(body.draft);
  await ruleStore.replace(body.draft.id, body.draft.suggestedRules.filter((r) => keep.has(r.id)));
  return void res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ id: body.draft.id }));
}

if (url.pathname === "/playbooks" && req.method === "GET") {
  res.setHeader("Content-Type", "application/json");
  return void res.end(JSON.stringify({ playbooks: await playbookStore.list() }));
}
```

Also allow the side panel's `POST` with JSON: if not already present, answer CORS preflight at the top of the handler:

```ts
res.setHeader("Access-Control-Allow-Headers", "Content-Type");
if (req.method === "OPTIONS") return void res.writeHead(204).end();
```

Add `data/` to `.gitignore`.

- [ ] **Step 6: Smoke test the routes**

Run (server running via `npm run dev -w server`):

```bash
curl -s -X POST localhost:8787/playbooks/draft -H 'content-type: application/json' -d '{"goal":"x","events":[]}'
curl -s -X POST localhost:8787/playbooks -H 'content-type: application/json' \
  -d '{"draft":{"id":"t","title":"T","appliesTo":[],"goals":[],"markdown":"# T","suggestedRules":[]},"ruleIds":[]}'
curl -s localhost:8787/playbooks | head -c 120; curl -s localhost:8787/rules | head -c 60
```

Expected: `{"error":"Send a goal and at least one event."}`, `{"id":"t"}`, a list containing `# T`, and rules JSON. Then delete `data/playbooks/t.md` and `data/rules/t.json`.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc -p server
git add server/src/playbooks/store.ts server/src/playbooks/store.test.ts server/src/index.ts .gitignore
git commit -m "Store published Playbooks and Rules and expose them over HTTP"
```

---

### Task 6: Live relay modes and per-session Playbooks

**Files:**
- Modify: `server/src/live.ts`, `server/src/tools.ts`, `server/src/index.ts`
- Test: `server/src/instructions.test.ts`; create `server/src/instructions.ts`

**Interfaces:**
- Consumes: `playbookStore` (Task 5), `systemInstruction`, `tools` (existing).
- Produces: `export type Mode = "guide" | "teach"`; `export function instructionFor(mode: Mode, playbooks: string[]): string`; `export const teachInstruction: string`; `relay(client, resumptionHandle?: string, mode: Mode = "guide")`. `/live?mode=teach` selects Teach mode.

- [ ] **Step 1: Write the failing test** — `server/src/instructions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { instructionFor } from "./instructions.ts";

describe("instructionFor", () => {
  it("guide mode includes the guide instruction and every Playbook", () => {
    const s = instructionFor("guide", ["# A", "# B"]);
    expect(s).toContain("Guide first, guard second");
    expect(s).toContain("# A");
    expect(s).toContain("# B");
  });
  it("teach mode tells the model to listen and ask why, not guide", () => {
    const s = instructionFor("teach", ["# A"]);
    expect(s).toContain("Teach mode");
    expect(s).toMatch(/do not guide/i);
    expect(s).not.toContain("# A");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server -- instructions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/instructions.ts`**

```ts
import { systemInstruction } from "./tools.ts";

export type Mode = "guide" | "teach";

export const teachInstruction = `You are GuideRail in Teach mode. An expert is showing how their org does a task in Google web tools so you can later guide new hires.
- Do not guide, do not give instructions, and do not describe where things are. You have no tools.
- You receive [page event] messages describing what the expert clicks, types and opens.
- Stay mostly quiet. After a meaningful choice (a field value, picking one option among several, an unexpected route such as setting something on a different page), ask ONE short "why?" question. Ask at most one question per three events.
- Acknowledge the expert's answers in a few words. Speak English unless the expert keeps speaking another language.`;

export function instructionFor(mode: Mode, playbooks: string[]): string {
  if (mode === "teach") return teachInstruction;
  return `${systemInstruction}\n\n# Playbooks\n\n${playbooks.join("\n\n---\n\n")}`;
}
```

- [ ] **Step 4: Use it in `server/src/live.ts`**

Remove the module-level `PLAYBOOKS`/`playbooks`/`instruction` constants and the `readdirSync`/`readFileSync`/`join` imports added for them. Change the signature and config:

```ts
import { instructionFor, type Mode } from "./instructions.ts";
import { loadPlaybooks } from "./playbooks/load.ts";

export async function relay(client: WebSocket, resumptionHandle?: string, mode: Mode = "guide") {
  // ...
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: instructionFor(mode, await loadPlaybooks()),
        tools: mode === "teach" ? [] : [{ functionDeclarations: tools }],
        // rest unchanged
```

Create `server/src/playbooks/load.ts` (seed files + published, read fresh per session so a just-published Playbook is used immediately):

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FilePlaybookStore } from "./store.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const published = new FilePlaybookStore(join(ROOT, "data", "playbooks"));

export async function loadPlaybooks(): Promise<string[]> {
  const seedDir = join(ROOT, "seed", "playbooks");
  const seed = await Promise.all((await readdir(seedDir)).filter((f) => f.endsWith(".md")).map((f) => readFile(join(seedDir, f), "utf8")));
  return [...seed, ...(await published.list())];
}
```

In `server/src/index.ts`, make `playbookStore` use the same directory (`join(ROOT, "data", "playbooks")`, already the case) and pass the mode:

```ts
wss.on("connection", (client, req) => {
  const params = new URL(req.url ?? "", "http://x").searchParams;
  const mode = params.get("mode") === "teach" ? "teach" : "guide";
  void relay(client, params.get("resume") ?? undefined, mode);
});
```

- [ ] **Step 5: Run tests, typecheck, and a live check**

Run: `npm test -w server && npx tsc -p server`
Expected: PASS.

Live check (costs a few cents): with the server running, run the existing relay replay script from the scratchpad against `ws://localhost:8787/live?mode=teach`, sending one text `"I'm going to set Region to us-central1"`. Expected: no `tool_call` messages, and a short spoken reply (an acknowledgement or a why-question).

- [ ] **Step 6: Commit**

```bash
git add server/src/instructions.ts server/src/instructions.test.ts server/src/playbooks/load.ts server/src/live.ts server/src/index.ts
git commit -m "Add Teach mode to the Live relay and load published Playbooks per session"
```

---

### Task 7: Side panel Teach session, draft review and publish

**Files:**
- Create: `extension/src/teach/session.ts`
- Modify: `extension/src/sidepanel.ts`, `extension/public/sidepanel.html`, `extension/public/panel.css`
- Test: `extension/src/teach/session.test.ts`

**Interfaces:**
- Consumes: `TeachEvent`, `compact` (Task 2); `teach` / `teach_event` messages (Task 3); `/live?mode=teach`, `POST /playbooks/draft`, `POST /playbooks`, `GET /rules` (Tasks 5–6).
- Produces:
  ```ts
  export class TeachSession {
    constructor(goal: string, now?: () => number);
    add(e: TeachEvent): void;
    heard(role: "user" | "model", text: string): void; // transcripts: model '?' turns become questions, next user turn an answer
    endTurn(role: "user" | "model"): void;
    get count(): number;
    payload(): { goal: string; events: TeachEvent[] };
  }
  export function describeForModel(e: TeachEvent): string | null; // text for a [page event], null for narration/answer
  ```

- [ ] **Step 1: Write the failing test** — `extension/src/teach/session.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { describeForModel, TeachSession } from "./session.ts";

const clock = () => { let t = 0; return () => ++t; };

describe("TeachSession", () => {
  it("turns user speech into narration", () => {
    const s = new TeachSession("Deploy", clock());
    s.heard("user", "I always pick ");
    s.heard("user", "us-central1");
    s.endTurn("user");
    expect(s.payload().events).toEqual([{ t: "narration", at: 1, text: "I always pick us-central1" }]);
  });
  it("records the expert's reply to a model question as an answer", () => {
    const s = new TeachSession("Deploy", clock());
    s.heard("model", "Why us-central1?");
    s.endTurn("model");
    s.heard("user", "Latency for our users");
    s.endTurn("user");
    expect(s.payload().events).toEqual([{ t: "answer", at: 1, question: "Why us-central1?", text: "Latency for our users" }]);
  });
  it("compacts events in the payload", () => {
    const s = new TeachSession("Deploy", clock());
    for (const v of ["o", "oc", "ocr"]) s.add({ t: "field", at: 0, url: "u", target: { role: "textbox", name: "Service name" }, value: v });
    expect(s.payload().events).toHaveLength(1);
  });
});

describe("describeForModel", () => {
  it("describes clicks and fields for the Teach-mode model", () => {
    expect(describeForModel({ t: "click", at: 0, url: "u", title: "", target: { role: "tab", name: "Labels", section: "Info panel" } }))
      .toBe('Expert clicked the tab "Labels" (in Info panel).');
    expect(describeForModel({ t: "field", at: 0, url: "u", target: { role: "combobox", name: "Region" }, value: "us-central1" }))
      .toBe('Expert set "Region" to "us-central1".');
    expect(describeForModel({ t: "narration", at: 0, text: "x" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w extension -- session.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `extension/src/teach/session.ts`**

```ts
import { compact, type TeachEvent } from "./events.ts";

export class TeachSession {
  private events: TeachEvent[] = [];
  private speech: Record<"user" | "model", string> = { user: "", model: "" };
  private lastQuestion: string | null = null;

  constructor(readonly goal: string, private now: () => number = Date.now) {}

  add(e: TeachEvent) { this.events.push(e); }

  heard(role: "user" | "model", text: string) { this.speech[role] += text; }

  endTurn(role: "user" | "model") {
    const text = this.speech[role].trim();
    this.speech[role] = "";
    if (!text) return;
    if (role === "model") {
      this.lastQuestion = text.endsWith("?") ? text : null;
      return;
    }
    if (this.lastQuestion) {
      this.events.push({ t: "answer", at: this.now(), question: this.lastQuestion, text });
      this.lastQuestion = null;
    } else {
      this.events.push({ t: "narration", at: this.now(), text });
    }
  }

  get count() { return this.events.length; }

  payload() { return { goal: this.goal, events: compact(this.events) }; }
}

export function describeForModel(e: TeachEvent): string | null {
  const where = (s?: string) => (s ? ` (in ${s})` : "");
  switch (e.t) {
    case "click": return `Expert clicked the ${e.target.role} "${e.target.name}"${where(e.target.section)}.`;
    case "field": return `Expert set "${e.target.name}"${where(e.target.section)} to "${e.value}".`;
    case "navigate": return `Expert opened ${e.url} (${e.title}).`;
    default: return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w extension -- session.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the Teach UI to `extension/public/sidepanel.html`** — inside `<header>`, before `#status`:

```html
<button id="teach" type="button" title="Show GuideRail how your team does a task">Teach</button>
```

and after `<ul id="issues" …>`:

```html
<section id="teachbar" class="card" hidden>
  <p><span class="rec" aria-hidden="true"></span> Recording: <span id="teachcount">0</span> steps. Do the task and explain why as you go.</p>
  <button id="teachstop" type="button">Stop and draft Playbook</button>
</section>
<section id="draft" class="card" hidden>
  <h2>Playbook draft</h2>
  <pre id="draftmd"></pre>
  <div id="draftrules"></div>
  <button id="publish" type="button">Publish</button>
</section>
```

Append to `extension/public/panel.css`:

```css
#teach[data-on] { background: var(--bad); border-color: var(--bad); color: #fff; }
.rec { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--bad); margin-right: 4px; animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: .2; } }
@media (prefers-reduced-motion: reduce) { .rec { animation: none; } }
#draftmd { white-space: pre-wrap; max-height: 240px; overflow: auto; font: 12px/1.5 ui-monospace, Menlo, monospace; background: var(--bg); padding: 8px; border-radius: 6px; }
#draftrules label { display: block; font-size: 13px; padding: 2px 0; }
```

- [ ] **Step 6: Wire Teach mode in `extension/src/sidepanel.ts`**

Add imports and state:

```ts
import { describeForModel, TeachSession } from "./teach/session.ts";
const HTTP = "http://localhost:8787";
let mode: "guide" | "teach" = "guide";
let teach: TeachSession | null = null;
let draft: any = null;
```

Change `connect()` to pass the mode, and load Rules from the server (bundled file as fallback) in `init()`:

```ts
ws = new WebSocket(`${SERVER}/live?mode=${mode}${resumeHandle && mode === "guide" ? `&resume=${encodeURIComponent(resumeHandle)}` : ""}`);
```

```ts
async function loadRules() {
  try {
    rules = (await (await fetch(`${HTTP}/rules`)).json()).rules;
  } catch {
    rules = (await (await fetch(chrome.runtime.getURL("rules.json"))).json()).rules;
  }
}
```

(call `await loadRules()` in `init()` instead of the bundled-only fetch).

In `onServer`, feed transcripts to the Teach session:

```ts
case "transcript": say(msg.role, msg.text); teach?.heard(msg.role, msg.text); break;
case "turn_complete": open = null; teach?.endTurn("user"); teach?.endTurn("model"); break; // the expert speaks before the model replies in a turn
```

In the `chrome.runtime.onMessage` listener add:

```ts
case "teach_event":
  if (!teach) break;
  teach.add(msg.event);
  $("#teachcount").textContent = String(teach.count);
  { const text = describeForModel(msg.event); if (text) sendServer({ type: "event", text }); }
  break;
```

Teach controls:

```ts
async function setTeach(on: boolean) {
  mode = on ? "teach" : "guide";
  ws?.close();
  await toPage({ kind: "teach", on }).catch(() => {});
  $("#teach").toggleAttribute("data-on", on);
  $("#teachbar").hidden = !on;
  connect();
}

$("#teach").addEventListener("click", async () => {
  if (mode === "teach") return;
  const goal = input.value.trim();
  if (!goal) { say("system", "Type the task you're teaching in the box, then press Teach."); return; }
  input.value = "";
  teach = new TeachSession(goal);
  say("system", `Teach mode: showing "${goal}". Do the task normally and say why as you go.`);
  await setTeach(true);
});

$("#teachstop").addEventListener("click", async () => {
  if (!teach) return;
  const payload = teach.payload();
  await setTeach(false);
  teach = null;
  say("system", "Drafting a Playbook from what you showed…");
  const res = await fetch(`${HTTP}/playbooks/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.json();
  if (!res.ok) { say("system", `Couldn't draft the Playbook: ${body.error}`); return; }
  draft = body;
  $("#draftmd").textContent = draft.markdown;
  $("#draftrules").replaceChildren(...draft.suggestedRules.map((r: any) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" checked> <span></span>`;
    label.querySelector("input")!.value = r.id;
    label.querySelector("span")!.textContent = `Rule: ${r.message} (${r.severity})`;
    return label;
  }));
  $("#draft").hidden = false;
});

$("#publish").addEventListener("click", async () => {
  if (!draft) return;
  const ruleIds = [...document.querySelectorAll<HTMLInputElement>("#draftrules input:checked")].map((i) => i.value);
  const res = await fetch(`${HTTP}/playbooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft, ruleIds }) });
  if (!res.ok) { say("system", "Publishing failed. Is the GuideRail server running?"); return; }
  $("#draft").hidden = true;
  say("system", `Published "${draft.title}". New hires will be guided by it from their next session.`);
  draft = null;
  await loadRules();
});
```

The expert types the task in the text box first, then presses Teach.

- [ ] **Step 7: Typecheck, test, build**

Run: `npx tsc -p extension && npm test -w extension && npm run build -w extension`
Expected: all PASS, build succeeds.

- [ ] **Step 8: Manual check in Chrome** (reload the unpacked extension from `extension/dist`)

1. Open `http://localhost:8787/sandbox/cloud-run-create.html`, open the side panel, type `Deploy a Cloud Run service our way`, press **Teach**.
2. Expected: red Teach button, "Recording: 0 steps", status Ready.
3. Fill Service name, pick a Region, click Create, say "I always use us-central1 unless it's an EU customer". Expected: the step count rises; the model asks at most occasional short "why?" questions and never gives instructions.
4. Click **Stop and draft Playbook**. Expected: a markdown draft naming Region and Create, and suggested Rules with checkboxes.
5. Click **Publish**. Expected: "Published …"; `data/playbooks/<id>.md` exists.
6. Press nothing else; reconnect in Guide mode and ask "how do I deploy to Cloud Run?". Expected: guidance mentions us-central1 and the expert's reason.

- [ ] **Step 9: Commit**

```bash
git add extension/src/teach/session.ts extension/src/teach/session.test.ts extension/src/sidepanel.ts extension/public/sidepanel.html extension/public/panel.css
git commit -m "Add Teach mode to the side panel: record, draft and publish Playbooks"
```

---

### Task 8: Make the sandbox match the real Cloud Run console

**Files:**
- Modify: `sandbox/cloud-run-create.html`, `sandbox/index.html`
- Create: `sandbox/cloud-run-services.html`

**Interfaces:**
- Consumes: `findSection` selected-tab support (Task 1). Content script reads label rows as consecutive key/value input pairs inside the Labels section.
- Produces: `cloud-run-create.html` with **no** Labels section and a collapsible heading `Containers, networking, security` with tabs Containers, Networking, Security, Settings, Variables & Secrets, Volumes; `cloud-run-services.html` with `<meta name="guiderail-url" content="console.cloud.google.com/run">`, a services table with a row checkbox per service (`ocr-service` present; also reads `?created=<name>` to add one), a **Show info panel** toggle, an info panel with `role="tablist"` containing tabs **Permissions** and **Labels** (`role="tab"`, `aria-selected`, `aria-controls`), a Labels `role="tabpanel"` with key/value rows (`aria-label="Key N"` / `"Value N"`), **Add label** and **Save** buttons. Save shows "Labels saved".

- [ ] **Step 1: Edit `cloud-run-create.html`**: remove the Labels section and its script; rename the collapsible to exactly `Containers, networking, security` using `<h3>` inside the toggle; add the six tabs listed above (empty placeholder content is fine). Successful Create navigates to `cloud-run-services.html?created=<service name>`. Keep the `?denied=1` permission-error behaviour unchanged.

- [ ] **Step 2: Create `cloud-run-services.html`** with the structure in the Interfaces block, the sandbox banner ("GuideRail sandbox — practice copy, not Google Cloud"), and the same visual style as the other sandbox pages. No external requests.

- [ ] **Step 3: Link it from `sandbox/index.html`.**

- [ ] **Step 4: Verify with the real extension code paths**

Run: `curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/sandbox/cloud-run-services.html` → `200`.
In Chrome (extension reloaded): on `cloud-run-services.html`, tick `ocr-service`, show the info panel, open the Labels tab, add `owner` = `pranit@example.com`, click Save. Expected: the GuideRail overlay outlines the Labels panel in red, the side panel lists the owner-format Violation (the policy engine finds the section through the selected tab), and the first Save click is held with the "policy issue(s) to fix first" toast.

- [ ] **Step 5: Commit**

```bash
git add sandbox/
git commit -m "Make the sandbox match the real Cloud Run console: labels on the Services list"
```

---

### Task 9: Language, decision record and pitch

**Files:**
- Modify: `CONTEXT.md`, `docs/pitch.md`
- Create: `docs/adr/0006-knowledge-from-expert-recordings.md`

- [ ] **Step 1: Add to `CONTEXT.md`** under a new `### Modes and knowledge` heading:

```md
**Teach mode**:
The mode in which an expert performs a task while GuideRail records what they do and asks why, to produce a Playbook.
_Avoid_: Record mode, expert mode, training

**Guide mode**:
The mode in which GuideRail coaches someone through a task using published Playbooks and Rules.
_Avoid_: Learner mode, help mode

**Teach session**:
One recording of an expert performing a Goal in Teach mode, made of steps, narration and answers.
_Avoid_: Recording, capture

**Playbook**:
Published, human-readable knowledge of how the org does a task and where things are in each tool, used to guide.
_Avoid_: Skill, tour, workflow, SOP
```

- [ ] **Step 2: Write `docs/adr/0006-knowledge-from-expert-recordings.md`**

```md
# Guidance knowledge comes from expert Teach sessions

GuideRail's knowledge of how the org does a task, and where things are in each tool, comes from Teach sessions: an expert performs the task in the real UI while GuideRail records meaning-level events (never coordinates, screenshots or passwords) and the expert's reasons, and Gemini drafts a Playbook the expert publishes. We chose this after our own assumption (labels on the Cloud Run create form) turned out wrong for the live console; docs and our guesses drift, the expert's real route doesn't. Rules proposed from a Teach session are suggestions the expert must confirm, so checks stay deterministic (ADR 0002).
```

- [ ] **Step 3: Update `docs/pitch.md`**: add under the one-liner: "**Your experts teach it once. Every new hire is guided by it, and guarded by your rules.**" Insert as demo beat 0: "**Teach (40 s):** an expert presses Teach and deploys to Cloud Run the org's way, saying why (us-central1 unless EU; labels added on the Services list). GuideRail asks one why-question and drafts a Playbook; the expert publishes it." Renumber the remaining beats.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/pitch.md docs/adr/0006-knowledge-from-expert-recordings.md
git commit -m "Document Teach mode: language, decision record and demo Act 0"
```

---

## Parallelism

Tasks 1→3 and 7 touch the extension; 4→6 touch the server; 8 touches only `sandbox/`; 9 only docs. Safe parallel lanes after Task 1: **{2, 3}**, **{4, 5, 6}**, **{8}**, **{9}**; Task 7 needs 2, 3, 5 and 6.
