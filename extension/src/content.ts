// Runs in Google pages. Reads the page, points at elements, watches what the user does.
// It never clicks, types or submits for the user (ADR 0001).
import type { FormState, FromPage, HighlightResult, PageElement, PageSnapshot, ToPage } from "./messages.ts";
import { allElements, effectiveUrl, findSection, isSecret, isVisible, nameOf, norm, roleOf, sectionOf } from "./page.ts";
import { startRecording, stopRecording } from "./teach/recorder.ts";

const MAX_ELEMENTS = 150;
const SUBMIT_WORDS = /^(create|deploy|save|grant|submit|confirm)\b/i;

let indexed = new Map<number, Element>();
let highlighted: Element | null = null;
let blockingFields: string[] = [];
let warnedSubmitAt = 0;

// ---------- Reading the page ----------


function readPage(): PageSnapshot {
  indexed = new Map();
  const elements: PageElement[] = [];
  for (const el of allElements()) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (isSecret(el) || !isVisible(el)) continue;
    const name = nameOf(el);
    if (!name) continue;
    const i = elements.length + 1;
    indexed.set(i, el);
    const item: PageElement = { i, role: roleOf(el), name };
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.value) item.value = el.value.slice(0, 60);
    }
    const section = sectionOf(el);
    if (section && section !== name) item.section = section;
    elements.push(item);
  }
  return { url: effectiveUrl(), title: document.title, elements };
}

// ---------- Finding an element by its text ----------

function score(target: string, name: string): number {
  const t = norm(target), n = norm(name);
  if (!t || !n) return 0;
  if (t === n) return 1;
  if (n.startsWith(t) || t.startsWith(n)) return 0.85;
  if (n.includes(t) || t.includes(n)) return 0.7;
  const tw = new Set(t.split(" ")), nw = new Set(n.split(" "));
  const shared = [...tw].filter((w) => nw.has(w)).length;
  return (shared / Math.max(tw.size, nw.size)) * 0.6;
}

function findElement(text: string, role?: string): HighlightResult {
  const snap = readPage();
  const ranked = snap.elements
    .map((e) => ({ e, s: score(text, e.name) + (role && e.role === role ? 0.05 : 0) }))
    .sort((a, b) => b.s - a.s);
  const best = ranked[0];
  if (best && best.s >= 0.6) {
    pointAt(indexed.get(best.e.i)!);
    return { found: true, i: best.e.i, name: best.e.name };
  }
  return { found: false, alternatives: ranked.slice(0, 5).filter((r) => r.s > 0).map((r) => r.e.name) };
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
  @keyframes pulse { 50% { box-shadow: 0 0 0 10px rgba(242,185,39,0); } }
  @media (prefers-reduced-motion: reduce) { .ring { animation: none; } }
</style><div class="layer"></div>`;
const layer = shadow.querySelector(".layer")!;
document.documentElement.append(host);

const ring = document.createElement("div");
ring.className = "ring";
ring.hidden = true;
layer.append(ring);
let badBoxes: { el: Element; box: HTMLDivElement }[] = [];

function place(box: HTMLElement, el: Element, pad: number) {
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
}

function pointAt(el: Element) {
  highlighted = el;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  ring.hidden = false;
}

function follow() {
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
  for (const el of document.querySelectorAll("input,select,textarea")) {
    if (labelInputs.has(el) || isSecret(el)) continue;
    const name = nameOf(el);
    const value = (el as HTMLInputElement).value;
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

const send = (msg: FromPage) => chrome.runtime.sendMessage(msg).catch(() => {});

let formTimer: ReturnType<typeof setTimeout> | undefined;
document.addEventListener("input", () => {
  clearTimeout(formTimer);
  formTimer = setTimeout(() => send({ kind: "form_changed", form: readForm() }), 300);
}, true);

document.addEventListener("click", (e) => {
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
}, true);

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    send({ kind: "page_event", text: `Page changed to ${effectiveUrl()} (${document.title}).` });
  }
}, 500);

// ---------- Requests from the side panel ----------

chrome.runtime.onMessage.addListener((msg: ToPage, _sender, reply) => {
  switch (msg.kind) {
    case "read_page": reply(readPage()); break;
    case "highlight": reply(findElement(msg.text, msg.role)); break;
    case "read_form": reply(readForm()); break;
    case "show_violations": showViolations(msg.fields, msg.submitLabel); reply({ ok: true }); break;
    case "clear": highlighted = null; showViolations([]); reply({ ok: true }); break;
    case "teach":
      if (msg.on) startRecording((event) => send({ kind: "teach_event", event }));
      else stopRecording();
      reply({ ok: true });
      break;
  }
  return false;
});
