// Runs in Google pages. Reads the page, points at elements, watches what the user does.
// It never clicks, types or submits for the user (ADR 0001).
import type { FormState, FromPage, HighlightResult, PageElement, PageSnapshot, ToPage, ViolationDetail } from "./messages.ts";
import { allElements, BAD_DARK, BAD_LIGHT, CUSTOM_FIELD, EDGE_DARK, EDGE_LIGHT, effectiveUrl, findSection, isDarkSurrounding, isSecret, isVisible, nameOf, norm, roleOf, sectionOf, valueOf, violationFieldElement, violationFieldLabel } from "./page.ts";
import { summarizeViolations, violationCountText } from "./policy.ts";
import { startRecording, stopRecording } from "./teach/recorder.ts";
import { CalmView, parseCalmPreset } from "./calm.ts";

const MAX_ELEMENTS = 150;
const SUBMIT_WORDS = /^(create|deploy|save|grant|submit|confirm)\b/i;

let indexed = new Map<number, Element>();
let highlighted: Element | null = null;
let violationSummary = summarizeViolations([]);
let warnedSubmitAt = 0;
let lastInputAt = 0;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const value = valueOf(el);
    if (value) item.value = value.slice(0, 60);
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
    pointAt(indexed.get(best.e.i)!, { scroll: !interacting() });
    return { found: true, i: best.e.i, name: best.e.name };
  }
  return { found: false, alternatives: ranked.slice(0, 5).filter((r) => r.s > 0).map((r) => r.e.name) };
}

// ---------- Overlay (Shadow DOM so the page's styles can't reach it) ----------

const host = document.createElement("guiderail-overlay");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>
  :host { all: initial; --gr-edge:${EDGE_LIGHT}; --gr-halo:rgba(224,161,0,.20); --gr-bad:${BAD_LIGHT}; }
  :host([data-theme="dark"]) { --gr-edge:${EDGE_DARK}; --gr-halo:rgba(242,185,39,.22); --gr-bad:${BAD_DARK}; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
  .ring { position: fixed; border-radius: 6px; outline: 2px solid var(--gr-edge); outline-offset: 2px;
          box-shadow: 0 0 10px 3px var(--gr-halo); transition: left .18s ease, top .18s ease, width .18s ease, height .18s ease; }
  .ring.pulse { animation: gr-pulse 1.4s ease-in-out 2; }
  @keyframes gr-pulse { 0%,100% { box-shadow: 0 0 6px 2px var(--gr-halo); } 50% { box-shadow: 0 0 16px 6px var(--gr-halo); } }
  .bad { position: fixed; border-radius: 6px; outline: 2px solid var(--gr-bad); outline-offset: 1px; background: transparent; }
  .cue { position: fixed; left: 50%; transform: translateX(-50%); background: #161d28; color: #fff; font: 600 12px/1.3 system-ui, sans-serif;
         padding: 4px 10px; border-radius: 999px; border: 2px solid var(--gr-edge); }
  .cue.above { top: 12px; }
  .cue.below { bottom: 12px; }
  .chip { position: fixed; max-width: 260px; background: #161d28; color: #fff; font: 500 11px/1.3 system-ui, sans-serif;
          padding: 4px 7px; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #161d28; color: #fff;
           font: 600 14px/1.4 system-ui, sans-serif; padding: 10px 14px; border-radius: 8px; border-left: 4px solid #e5484d;
           box-shadow: 0 6px 24px rgba(0,0,0,.25); max-width: 420px; }
  .rec { position: fixed; left: 16px; bottom: 16px; background: #000; color: #fff; border: 2px solid #fff;
         font: 600 13px/1.2 system-ui, sans-serif; padding: 6px 10px; border-radius: 999px; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
  .rec .dot { color: #ff5c5c; }
  :host(.gr-calm) .ring { animation: none; transition: none; }
  :host(.gr-calm) .rec { animation: none; }
  .gr-shade { position: fixed; box-shadow: 0 0 0 100vmax rgba(0,0,0,.08); }
  @media (prefers-reduced-motion: reduce) { .ring { animation: none !important; transition: none; } }
  @media (forced-colors: active) {
    .ring { outline: 2px solid Highlight; box-shadow: none; forced-color-adjust: none; }
    .bad { outline: 2px solid Highlight; forced-color-adjust: none; }
    .chip, .cue { forced-color-adjust: auto; }
  }
</style><div class="layer"></div>`;
const layer = shadow.querySelector(".layer")!;
// A copy left by a previous version of the extension (after a reload) is replaced.
document.querySelectorAll("guiderail-overlay").forEach((old) => old.remove());
document.documentElement.append(host);

const ring = document.createElement("div");
ring.className = "ring";
ring.hidden = true;
ring.setAttribute("aria-hidden", "true");
layer.append(ring);
const cue = document.createElement("div");
cue.hidden = true;
layer.append(cue);
let badBoxes: { el: Element; box: HTMLDivElement; chip: HTMLDivElement }[] = [];
const calm = new CalmView(host, layer, (text) => send({ kind: "customize_event", text }));
let followRunning = false;

function place(box: HTMLElement, el: Element, pad: number) {
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
}

function placeChip(chip: HTMLElement, el: Element) {
  const r = el.getBoundingClientRect();
  const top = Math.max(4, r.top - chip.offsetHeight - 8);
  const left = Math.min(window.innerWidth - chip.offsetWidth - 8, Math.max(4, r.right - chip.offsetWidth));
  Object.assign(chip.style, { left: `${left}px`, top: `${top}px` });
}

function applyTheme(el: Element) {
  host.dataset.theme = isDarkSurrounding(el) ? "dark" : "light";
}

// The person is interacting: an editable field has focus, or they typed in the last 2 seconds.
function interacting() {
  const active = document.activeElement;
  const editable = !!active && (active.matches("input,select,textarea") || (active as HTMLElement).isContentEditable);
  return editable || Date.now() - lastInputAt < 2000;
}

function offscreen(el: Element): "above" | "below" | null {
  const r = el.getBoundingClientRect();
  return r.bottom < 0 ? "above" : r.top > window.innerHeight ? "below" : null;
}

function placeCue(el: Element) {
  const side = offscreen(el);
  cue.hidden = !side;
  if (!side) return;
  cue.className = `cue ${side}`;
  cue.textContent = side === "above" ? "↑ Step is above" : "↓ Step is below";
}

function pointAt(el: Element, opts: { scroll?: boolean } = {}) {
  highlighted = el;
  applyTheme(el);
  ring.hidden = false;
  place(ring, el, 4);
  // Pulse twice (~1.4s each) then settle; never under reduced motion.
  ring.classList.remove("pulse");
  if (!reducedMotion()) { void ring.offsetWidth; ring.classList.add("pulse"); }
  // No unsolicited scrolling while the person interacts; an off-screen Step gets a cue instead. Never smooth under reduced motion or calm.
  if (opts.scroll && offscreen(el)) el.scrollIntoView({ block: "center", behavior: reducedMotion() || calm.active ? "auto" : "smooth" });
  placeCue(el);
  startFollow();
}

function showField(field: string) {
  const el = violationFieldElement(field);
  if (!el) return;
  pointAt(el);
  el.scrollIntoView({ block: "center", behavior: reducedMotion() || calm.active ? "auto" : "smooth" });
}

function startFollow() {
  if (followRunning) return;
  followRunning = true;
  requestAnimationFrame(follow);
}

function follow() {
  if (!alive()) return shutdown();
  calm.follow(highlighted, badBoxes.map(({ el }) => el));
  if (highlighted) {
    if (highlighted.isConnected && isVisible(highlighted)) { place(ring, highlighted, 4); ring.hidden = false; placeCue(highlighted); }
    else { ring.hidden = true; highlighted = null; }
  } else ring.hidden = true;
  if (!highlighted) cue.hidden = true;
  badBoxes = badBoxes.filter(({ el, box, chip }) => {
    if (!el.isConnected || !isVisible(el)) { box.remove(); chip.remove(); return false; }
    place(box, el, 3);
    placeChip(chip, el);
    return true;
  });
  if (!highlighted && badBoxes.length === 0 && ring.hidden) { followRunning = false; return; }
  if (highlighted || badBoxes.length) requestAnimationFrame(follow);
  else followRunning = false;
}
window.addEventListener("resize", () => { if (highlighted || badBoxes.length) startFollow(); });
document.addEventListener("scroll", () => { if (highlighted || badBoxes.length) startFollow(); }, true);

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

/** Marks each Violation's exact field and returns the fields it could mark on this page. */
function showViolations(violations: ViolationDetail[]): string[] {
  violationSummary = summarizeViolations(violations);
  for (const { box, chip } of badBoxes) { box.remove(); chip.remove(); }
  badBoxes = [];
  // One box per unique field; chips carry every Rule message for that field. Never the whole section, never the submit button.
  const byField = new Map<string, ViolationDetail[]>();
  for (const v of violations) byField.set(v.field, [...(byField.get(v.field) ?? []), v]);
  const shown: string[] = [];
  for (const [field, items] of byField) {
    const el = violationFieldElement(field);
    if (!el) continue;
    shown.push(field);
    applyTheme(el);
    const box = document.createElement("div");
    box.className = "bad";
    layer.append(box);
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = `${violationFieldLabel(field)}: ${items.map((i) => i.message).join(" ")}`;
    layer.append(chip);
    badBoxes.push({ el, box, chip });
    place(box, el, 3);
    placeChip(chip, el);
  }
  if (badBoxes.length) startFollow();
  return shown;
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
  lastInputAt = Date.now();
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
    if (violationSummary.fixCount && Date.now() - warnedSubmitAt > 10_000) {
      warnedSubmitAt = Date.now();
      e.preventDefault();
      e.stopImmediatePropagation();
      toast(`GuideRail: ${violationCountText(violationSummary)}. Click again to continue anyway.`);
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
    send({ kind: "page_event", text: `Page changed to ${effectiveUrl()} (${document.title}).` });
  }
}, 500);

// ---------- Requests from the side panel ----------

chrome.runtime.onMessage.addListener((msg: ToPage, _sender, reply) => {
  switch (msg.kind) {
    case "customize":
      try { reply(calm.set(parseCalmPreset(msg.preset))); startFollow(); }
      catch (err) { reply({ error: err instanceof Error ? err.message : "Invalid preset." }); }
      break;
    case "read_page": reply(readPage()); break;
    case "highlight": reply(findElement(msg.text, msg.role)); break;
    case "read_form": reply(readForm()); break;
    case "show_violations": reply({ shown: showViolations(msg.violations) }); break;
    case "show_field": showField(msg.field); reply({ ok: true }); break;
    case "clear": highlighted = null; ring.hidden = true; cue.hidden = true; showViolations([]); reply({ ok: true }); break;
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
