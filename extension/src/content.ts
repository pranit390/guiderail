// Runs in Google pages. Reads the page, points at elements, watches what the user does.
// It never clicks, types or submits for the user (ADR 0001).
import type { FormState, FromPage, HighlightResult, PageElement, PageSnapshot, ToPage } from "./messages.ts";
import { allElements, collectControls, CUSTOM_FIELD, effectiveUrl, findSection, isSecret, nameOf, norm, roleOf, sectionOf, valueOf } from "./page.ts";
import { liveHighlight } from "./resolve.ts";
import { startRecording, stopRecording } from "./teach/recorder.ts";
import { CalmView, parseCalmPreset } from "./calm.ts";

const MAX_ELEMENTS = 150;
const SUBMIT_WORDS = /^(create|deploy|save|grant|submit|confirm)\b/i;

let indexed = new Map<number, Element>();
let generation = 0;
let highlighted: Element | null = null;
let blockingFields: string[] = [];
let warnedSubmitAt = 0;

// ---------- Reading the page ----------


function readPage(): PageSnapshot {
  generation += 1;
  indexed = new Map();
  const elements: PageElement[] = [];
  for (const control of collectControls(MAX_ELEMENTS)) {
    indexed.set(control.i, control.el);
    const item: PageElement = { i: control.i, role: control.role, name: control.name };
    if (control.value) item.value = control.value;
    if (control.section) item.section = control.section;
    elements.push(item);
  }
  return { url: effectiveUrl(), title: document.title, elements, generation };
}

// ---------- Pointing at a pinned element ----------

function highlightRequest(msg: Extract<ToPage, { kind: "highlight" }>): HighlightResult {
  const { result, el } = liveHighlight(msg, generation, indexed);
  if (el) pointAt(el);
  return result;
}

// ---------- Overlay (Shadow DOM so the page's styles can't reach it) ----------

const host = document.createElement("guiderail-overlay");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
  .ring { position: fixed; border: 3px solid #f2b927; border-radius: 8px; box-shadow: 0 0 0 4px rgba(242,185,39,.35);
          animation: pulse 1.2s ease-in-out infinite; transition: all .15s ease; }
  .bad { position: fixed; border: 2px solid #e5484d; border-radius: 6px; background: rgba(229,72,77,.06); }
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #161d28; color: #fff;
           font: 600 14px/1.4 system-ui, sans-serif; padding: 10px 14px; border-radius: 8px; border-left: 4px solid #e5484d;
           box-shadow: 0 6px 24px rgba(0,0,0,.25); max-width: 420px; }
  .rec { position: fixed; left: 16px; bottom: 16px; background: #000; color: #fff; border: 2px solid #fff;
         font: 600 13px/1.2 system-ui, sans-serif; padding: 6px 10px; border-radius: 999px; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
  .rec .dot { color: #ff5c5c; }
  :host(.gr-calm) .ring { animation: none; transition: none; }
  :host(.gr-calm) .rec { animation: none; }
  .gr-shade { position: fixed; box-shadow: 0 0 0 100vmax rgba(0,0,0,.08); }
  @keyframes pulse { 50% { box-shadow: 0 0 0 10px rgba(242,185,39,0); } }
  @media (prefers-reduced-motion: reduce) { .ring { animation: none; } }
</style><div class="layer"></div>`;
const layer = shadow.querySelector(".layer")!;
// A copy left by a previous version of the extension (after a reload) is replaced.
document.querySelectorAll("guiderail-overlay").forEach((old) => old.remove());
document.documentElement.append(host);

const ring = document.createElement("div");
ring.className = "ring";
ring.hidden = true;
layer.append(ring);
let badBoxes: { el: Element; box: HTMLDivElement }[] = [];
const calm = new CalmView(host, layer, (text) => send({ kind: "customize_event", text }));

function place(box: HTMLElement, el: Element, pad: number) {
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
}

function pointAt(el: Element) {
  highlighted = el;
  el.scrollIntoView({ block: "center", behavior: calm.active ? "instant" : "smooth" });
  ring.hidden = false;
}

function follow() {
  if (!alive()) return shutdown();
  calm.follow(highlighted, badBoxes.map(({ el }) => el));
  if (highlighted && highlighted.isConnected) place(ring, highlighted, 6);
  else ring.hidden = true;
  for (const { el, box } of badBoxes) place(box, el, 3);
  requestAnimationFrame(follow);
}
requestAnimationFrame(follow);

function toast(text: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  layer.append(t);
  setTimeout(() => t.remove(), 5000);
}

// The expert always sees when Teach is recording this page.
const badge = document.createElement("div");
badge.className = "rec";
badge.setAttribute("role", "status");
badge.setAttribute("aria-live", "polite");
badge.hidden = true;
layer.append(badge);

function setRecording(on: boolean) {
  if (on) startRecording((event) => send({ kind: "teach_event", event }));
  else stopRecording();
  badge.hidden = !on;
  badge.innerHTML = on ? `<span class="dot" aria-hidden="true">●</span> GuideRail is recording` : "";
}

// ---------- Forms ----------

function readForm(): FormState {
  const labels: Record<string, string> = {};
  const labelInputs = new Set<Element>();
  const section = findSection("Labels");
  if (section) {
    const inputs = [...section.querySelectorAll("input")].filter((i) => i.type === "text" || i.type === "");
    for (let k = 0; k + 1 < inputs.length; k += 2) {
      labelInputs.add(inputs[k]).add(inputs[k + 1]);
      const key = inputs[k].value.trim();
      if (key) labels[key] = inputs[k + 1].value.trim();
    }
  }
  const fields: Record<string, string> = {};
  for (const el of document.querySelectorAll(`input,select,textarea,${CUSTOM_FIELD}`)) {
    if (labelInputs.has(el) || isSecret(el)) continue;
    const name = nameOf(el);
    const value = valueOf(el);
    if (name && value) fields[name] = value;
  }
  const sections = section ? ["Labels"] : [];
  if (findSection("Grant access")) sections.push("Grant access");
  return { url: effectiveUrl(), labels, fields, sections };
}

function fieldElement(field: string): Element | null {
  if (field.startsWith("label:")) return findSection("Labels");
  const el = [...document.querySelectorAll("input,select,textarea")].find((e) => norm(nameOf(e)) === norm(field));
  return el ?? null;
}

function showViolations(fields: string[], submitLabel?: string) {
  blockingFields = fields;
  for (const { box } of badBoxes) box.remove();
  badBoxes = [];
  const targets = new Set<Element>();
  for (const f of fields) {
    const el = fieldElement(f);
    if (el) targets.add(el);
  }
  if (fields.length && submitLabel) {
    const submit = allElements().find((el) => roleOf(el) === "button" && norm(nameOf(el)) === norm(submitLabel));
    if (submit) targets.add(submit);
  }
  for (const el of targets) {
    const box = document.createElement("div");
    box.className = "bad";
    layer.append(box);
    badBoxes.push({ el, box });
  }
}

// ---------- Watching the user ----------

// After the extension is reloaded, this copy of the script is orphaned: chrome.runtime calls
// throw "Extension context invalidated". It then shuts itself down quietly.
const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

function send(msg: FromPage) {
  if (!alive()) return shutdown();
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    shutdown();
  }
}

let formTimer: ReturnType<typeof setTimeout> | undefined;
function onInput() {
  clearTimeout(formTimer);
  formTimer = setTimeout(() => send({ kind: "form_changed", form: readForm() }), 300);
}
document.addEventListener("input", onInput, true);

function onClick(e: MouseEvent) {
  const target = e.target as Element;
  const button = target.closest('button,[role=button],input[type=submit]');
  if (button && SUBMIT_WORDS.test(nameOf(button))) {
    send({ kind: "submit_intent", label: nameOf(button), form: readForm() });
    // Soft guard: the first attempt with blocking Violations is held; a second click goes through.
    if (blockingFields.length && Date.now() - warnedSubmitAt > 10_000) {
      warnedSubmitAt = Date.now();
      e.preventDefault();
      e.stopImmediatePropagation();
      toast(`GuideRail: ${blockingFields.length} policy issue(s) to fix first. Click again to continue anyway.`);
      return;
    }
  }
  if (highlighted && (highlighted === target || highlighted.contains(target))) {
    send({ kind: "page_event", text: `User clicked "${nameOf(highlighted)}".` });
    highlighted = null;
  }
}
document.addEventListener("click", onClick, true);

let lastUrl = location.href;
const urlTimer = setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    generation += 1;
    send({ kind: "page_event", text: `Page changed to ${effectiveUrl()} (${document.title}).`, generation });
  }
}, 500);

// ---------- Requests from the side panel ----------

chrome.runtime.onMessage.addListener((msg: ToPage, _sender, reply) => {
  switch (msg.kind) {
    case "customize":
      try { reply(calm.set(parseCalmPreset(msg.preset))); }
      catch (err) { reply({ error: err instanceof Error ? err.message : "Invalid preset." }); }
      break;
    case "read_page": reply(readPage()); break;
    case "highlight": reply(highlightRequest(msg)); break;
    case "read_form": reply(readForm()); break;
    case "show_violations": showViolations(msg.fields, msg.submitLabel); reply({ ok: true }); break;
    case "clear": highlighted = null; showViolations([]); reply({ ok: true }); break;
    case "teach":
      setRecording(msg.on);
      reply({ ok: true });
      break;
  }
  return false;
});

function shutdown() {
  calm.restore();
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("click", onClick, true);
  clearInterval(urlTimer);
  clearTimeout(formTimer);
  setRecording(false);
  host.remove();
}

// A page loaded mid-Teach (navigation, reload, new tab) picks recording back up.
try {
  chrome.runtime.sendMessage({ kind: "teach_status" } satisfies FromPage)
    .then((res: { on?: boolean } | undefined) => { if (res?.on) setRecording(true); })
    .catch(() => {});
} catch {
  shutdown();
}
