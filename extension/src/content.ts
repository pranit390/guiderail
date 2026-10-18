// Runs in Google pages. Reads the page, points at elements, watches what the user does.
// Only approved Database ID text assistance is supported; never clicks or submits.
import { fillDatabaseId } from "./assist-field.ts";
import type { FormState, FromPage, HighlightResult, PageElement, PageSnapshot, ToPage, ViolationDetail } from "./messages.ts";
import { allElements, BAD_DARK, BAD_LIGHT, collectControls, CUSTOM_FIELD, EDGE_DARK, EDGE_LIGHT, effectiveUrl, findSection, isDarkSurrounding, isSecret, isSensitivePage, isVisible, nameOf, norm, roleOf, sectionOf, textOf, safeValueOf, violationFieldElement, violationFieldLabel } from "./page.ts";
import { summarizeViolations, violationCountText } from "./policy.ts";
import { liveHighlight } from "./resolve.ts";
import { isSecretField, MASK, maskValue } from "./teach/events.ts";
import { readDocument, findDocumentHeading } from "./document.ts";
import { startRecording, stopRecording } from "./teach/recorder.ts";
import { GLYPH_CSS, STATES, stateGlyph, violationState } from "./states.ts";
import { CalmView, parseCalmPreset } from "./calm.ts";
import { FIRESTORE_CREATE_DIALOG } from "./firestore.ts";

const MAX_ELEMENTS = 150;
const SUBMIT_WORDS = /^(create|deploy|save|grant|submit|confirm)\b/i;

let indexed = new Map<number, Element>();
let snapshotRoles = new Map<number, string>();
let generation = 0;
// The approved Assist target survives later reads; only navigation or a reload drops it.
let assistPin: { token: number; el: Element } | undefined;
let pins = 0;
let highlighted: Element | null = null;
let violationSummary = summarizeViolations([]);
let warnedSubmitAt = 0;
let lastInputAt = 0;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Reading the page ----------


function readPage(): PageSnapshot {
  generation += 1;
  indexed = new Map();
  snapshotRoles = new Map();
  const elements: PageElement[] = [];
  const rank: number[] = [];
  for (const control of collectControls(MAX_ELEMENTS)) {
    indexed.set(control.i, control.el);
    snapshotRoles.set(control.i, control.role);
    const item: PageElement = { i: control.i, role: control.role, name: control.name };
    if (control.value) item.value = control.value;
    if (control.section) item.section = control.section;
    elements.push(item);
    rank.push(control.rank);
  }
  return { url: effectiveUrl(), title: document.title, elements, generation, document: readDocument(), rank };
}


// ---------- Pointing at a pinned element ----------

function clearHighlight() {
  highlighted = null;
  ring.hidden = true;
  stepChip.hidden = true;
  cue.hidden = true;
}

function highlightRequest(msg: Extract<ToPage, { kind: "highlight" }>): HighlightResult {
  const { result, el } = liveHighlight(msg, generation, indexed, snapshotRoles);
  if (el) pointAt(el, { scroll: !interacting() });
  else clearHighlight();
  return result;
}

// ---------- Overlay (Shadow DOM so the page's styles can't reach it) ----------

let overlayStopped = false;
const host = document.createElement("guiderail-overlay");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>
  :host { all: initial; }
  ${GLYPH_CSS}
  .layer > * { --gr-edge:${EDGE_LIGHT}; --gr-halo:rgba(95,224,168,.3); --gr-check:${STATES.check.light}; --gr-bad:${BAD_LIGHT}; --gr-on-stop:#fff; }
  .layer > [data-theme="dark"] { --gr-edge:${EDGE_DARK}; --gr-check:${STATES.check.dark}; --gr-bad:${BAD_DARK}; --gr-on-stop:#2d0805; }
  .layer { position:fixed; inset:0; pointer-events:none; z-index:2147483647; }
  .ring, .bad { position:fixed; border-radius:6px; outline:2px solid var(--gr-edge); outline-offset:3px; background:transparent; }
  .ring::after, .bad.check::after { content:""; position:absolute; inset:-4px; border-radius:inherit; box-shadow:0 0 12px 4px var(--gr-halo); opacity:.35; }
  .ring.pulse::after { animation:gr-breathe 2400ms cubic-bezier(.45,0,.55,1) 3; }
  @keyframes gr-breathe { 50% { opacity:1; } }
  .bad.stop { outline-color:var(--gr-bad); box-shadow:0 0 0 7px color-mix(in srgb,var(--gr-bad) 12%,transparent); animation:gr-settle 320ms cubic-bezier(.3,1.35,.5,1); }
  .bad.check { outline:2px dashed var(--gr-check); }
  .bad.check::after { --gr-halo:rgba(255,210,63,.3); animation:gr-breathe 1400ms ease-in-out 2; }
  @keyframes gr-settle { from { opacity:0; transform:scale(1.04); } }
  .cue { position:fixed; left:50%; transform:translateX(-50%); background:#16211c; color:#fff; font:600 12px/1.3 system-ui,sans-serif; padding:4px 10px; border-radius:999px; border:2px solid var(--gr-edge); }
  .cue.above { top:12px; } .cue.below { bottom:12px; }
  .chip { position:fixed; max-width:260px; background:#16211c; color:#fff; font:500 11px/1.3 system-ui,sans-serif; padding:4px 7px; border-radius:6px; box-shadow:0 4px 14px rgba(0,0,0,.25); }
  .chip .state-glyph.stop { color:${BAD_DARK}; --gr-on-stop:#2d0805; }
  .chip .state-glyph.check { color:${STATES.check.dark}; }
  .chip .state-glyph.go { color:${EDGE_DARK}; }
  .toast { position:fixed; left:50%; bottom:28px; transform:translateX(-50%); background:#16211c; color:#fff; font:600 14px/1.4 system-ui,sans-serif; padding:10px 14px; border-radius:8px; border:2px dashed ${STATES.check.dark}; max-width:420px; }
  .rec { position:fixed; right:16px; top:16px; background:#16211c; color:${STATES.check.dark}; border:2px dashed currentColor; font:600 13px/1.2 system-ui,sans-serif; padding:6px 10px; border-radius:6px; }
  :host(.gr-calm) .ring::after, :host(.gr-calm) .bad, :host(.gr-calm) .bad::after { animation:none; transition:none; }
  .gr-shade { position: fixed; box-shadow: 0 0 0 100vmax rgba(0,0,0,.08); }
  @media (prefers-reduced-motion: reduce) { .ring, .ring::after, .bad, .bad::after { animation:none !important; transition:none; } }
  @media (forced-colors: active) {
    .ring { outline: 2px solid Highlight; box-shadow: none; forced-color-adjust: none; }
    .bad.stop { outline-color:Mark; box-shadow:none; forced-color-adjust:none; }
    .bad.check { outline-color:Highlight; forced-color-adjust:none; }
    .ring::after, .bad::after { display:none; }
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
const stepChip = document.createElement("div");
stepChip.className = "chip step-chip";
stepChip.hidden = true;
layer.append(stepChip);
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
  // A chip with no field beside it is noise; hide it while its field is off-screen, as the box is.
  chip.hidden = !!offscreen(el);
  if (chip.hidden) return;
  const r = el.getBoundingClientRect();
  const rtl = getComputedStyle(el).direction === "rtl";
  // Narrow the chip to the room beside the field (gap 8px, margin 4px, padding 14px) so it can sit there.
  const room = (rtl ? r.left : window.innerWidth - r.right) - 26;
  chip.style.maxWidth = `${room >= 120 ? Math.min(260, room) : 260}px`;
  const w = chip.offsetWidth, h = chip.offsetHeight;
  // Beside the field at its inline end, vertically centred; else just below it. Never over another form control.
  const beside = new DOMRect(rtl ? r.left - 8 - w : r.right + 8, r.top + (r.height - h) / 2, w, h);
  const belowLeft = Math.min(window.innerWidth - w - 4, Math.max(4, rtl ? r.left : r.right - w));
  const below = new DOMRect(belowLeft, r.bottom + 6, w, h);
  // No free spot beside or below: only the focused field's chip may also try just above it.
  const spots = el.contains(document.activeElement) ? [beside, below, new DOMRect(belowLeft, r.top - 6 - h, w, h)] : [beside, below];
  const spot = spots.find((s) => fitsViewport(s) && !coversControl(s, el));
  // Still no free spot: keep the chip hidden; the panel row carries the Rule message.
  if (!spot) { chip.hidden = true; return; }
  Object.assign(chip.style, { left: `${spot.left}px`, top: `${spot.top}px` });
}

function fitsViewport(s: DOMRect) {
  return s.left >= 4 && s.top >= 4 && s.right <= window.innerWidth - 4 && s.bottom <= window.innerHeight - 4;
}

function coversControl(s: DOMRect, own: Element) {
  for (const c of document.querySelectorAll(`input,select,textarea,button,${CUSTOM_FIELD}`)) {
    if (c === own || own.contains(c) || c.contains(own) || !isVisible(c)) continue;
    const o = c.getBoundingClientRect();
    if (s.left < o.right && o.left < s.right && s.top < o.bottom && o.top < s.bottom) return true;
  }
  return false;
}

function applyTheme(node: HTMLElement, el: Element) {
  node.dataset.theme = isDarkSurrounding(el) ? "dark" : "light";
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

function surfaceVisible(surface: Element): boolean {
  if (!surface.isConnected) return false;
  for (let ancestor: Element | null = surface; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (ancestor.hasAttribute("hidden") || style.display === "none" || style.visibility === "hidden") return false;
    if (ancestor.matches("dialog:not([open])")) return false;
    if (ancestor.hasAttribute("popover") && !ancestor.matches(":popover-open")) return false;
  }
  return true;
}

// All overlay users share this owner. Transient top-layer surfaces must never
// strand the Guard or calm view when the application hides/removes a wizard.
function ensureOverlaySurface(target?: Element) {
  if (overlayStopped) return;
  const replacement = document.querySelector("guiderail-overlay");
  if (replacement && replacement !== host) { surfaceObserver.disconnect(); return; }
  const candidate = target?.closest("[popover],dialog[open]");
  const surface = candidate && surfaceVisible(candidate) ? candidate : document.documentElement;
  if (target || !host.parentElement || !surfaceVisible(host.parentElement)) {
    if (host.parentElement !== surface) surface.append(host);
  }
}
const surfaceObserver = new MutationObserver(() => ensureOverlaySurface());
surfaceObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden", "style"] });
document.addEventListener("toggle", onSurfaceToggle, true);
function onSurfaceToggle() { ensureOverlaySurface(); }

function pointAt(el: Element, opts: { scroll?: boolean } = {}) {
  ensureOverlaySurface(el);
  highlighted = el;
  applyTheme(ring, el);
  applyTheme(cue, el);
  ring.hidden = false;
  place(ring, el, 4);
  stepChip.replaceChildren(stateGlyph("go"), document.createTextNode(`Here · ${nameOf(el)}`));
  placeChip(stepChip, el);
  // Three soft breaths, then a static halo.
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
  ensureOverlaySurface();
  calm.follow(highlighted, badBoxes.map(({ el }) => el));
  if (highlighted) {
    if (highlighted.isConnected && surfaceVisible(highlighted) && isVisible(highlighted)) { place(ring, highlighted, 4); ring.hidden = false; placeCue(highlighted); placeChip(stepChip, highlighted); }
    else { ring.hidden = true; highlighted = null; }
  } else ring.hidden = true;
  if (!highlighted) { cue.hidden = true; stepChip.hidden = true; }
  badBoxes = badBoxes.filter(({ el, box, chip }) => {
    if (!el.isConnected || !isVisible(el)) { box.remove(); chip.remove(); return false; }
    place(box, el, 3);
    placeChip(chip, el);
    return true;
  });
  if (highlighted || badBoxes.length || calm.active) requestAnimationFrame(follow);
  else followRunning = false;
}
function onViewportChange() { if (highlighted || badBoxes.length || calm.active) startFollow(); }
window.addEventListener("resize", onViewportChange);
document.addEventListener("scroll", onViewportChange, true);

function toast(text: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "alert");
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
  badge.replaceChildren(...(on ? [stateGlyph("check"), document.createTextNode("Recording · GuideRail")] : []));
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
      if (key) labels[maskValue(key)] = isSecretField({ name: key }) ? MASK : maskValue(inputs[k + 1].value.trim());
    }
  }
  const fields: Record<string, string> = {};
  for (const el of document.querySelectorAll(`input,select,textarea,${CUSTOM_FIELD}`)) {
    if (labelInputs.has(el) || isSecret(el) || !isVisible(el)) continue;
    const name = maskValue(nameOf(el));
    const value = safeValueOf(el);
    if (name) fields[name] = value || fields[name] || "";
  }
  const sections = section ? ["Labels"] : [];
  if (findSection("Grant access")) sections.push("Grant access");
  const createDialog = findSection(FIRESTORE_CREATE_DIALOG);
  if (createDialog && isVisible(createDialog)) sections.push(FIRESTORE_CREATE_DIALOG);
  return { url: effectiveUrl(), labels, fields, sections };
}

/** Marks each Violation's exact field and returns the fields it could mark on this page. */
function showViolations(violations: ViolationDetail[]): string[] {
  ensureOverlaySurface();
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
    const box = document.createElement("div");
    const state = items.some((item) => item.severity === "block") ? "stop" : violationState("warn");
    box.className = `bad ${state}`;
    applyTheme(box, el);
    layer.append(box);
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.append(stateGlyph(state), document.createTextNode(`${STATES[state].label} · ${violationFieldLabel(field)}: ${items.map((i) => i.message).join(" ")}`));
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
  if (isSensitivePage()) return;
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
  if (!alive()) return shutdown();
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
    generation += 1;
    assistPin = undefined;
    clearHighlight();
    send({ kind: "page_event", text: `Page changed to ${effectiveUrl()} (${document.title}).`, generation });
  }
}, 500);

// ---------- Requests from the side panel ----------

chrome.runtime.onMessage.addListener((msg: ToPage, _sender, reply) => {
  if (isSensitivePage()) {
    reply({ error: "GuideRail does not read or record sensitive account pages." });
    return false;
  }
  if (msg.expectedUrl && msg.expectedUrl !== location.href) {
    reply({ error: "The page changed before the command. Re-read the bound Journey tab." });
    return;
  }
  ensureOverlaySurface();
  switch (msg.kind) {
    case "customize":
      try { reply(calm.set(parseCalmPreset(msg.preset))); startFollow(); }
      catch (err) { reply({ error: err instanceof Error ? err.message : "Invalid preset." }); }
      break;
    case "read_page": reply(readPage()); break;
    case "read_document": reply(readDocument() ?? { error: "Open one of the pinned public docs pages first." }); break;
    case "highlight_document": {
      const heading = findDocumentHeading(msg.heading);
      highlighted = null;
      ring.hidden = true;
      if (heading) pointAt(heading, { scroll: !interacting() });
      reply(heading ? { found: true, name: textOf(heading) } : { found: false, error: "That section is absent, hidden or ambiguous on this page." });
      break;
    }
    case "highlight": reply(highlightRequest(msg)); break;
    case "clear_highlight": clearHighlight(); reply({ ok: true }); break;
    case "read_form": reply(readForm()); break;
    case "pin_field": {
      const el = msg.generation === generation ? indexed.get(msg.index) : undefined;
      if (el) assistPin = { token: ++pins, el };
      reply(el ? { pin: pins } : { error: "The page read is stale. Review a new plan." });
      break;
    }
    case "fill_field":
      try {
        if (msg.fieldName !== "Database ID" || !assistPin || msg.pin !== assistPin.token) throw new Error("The approved page read is stale. Review a new plan.");
        reply(fillDatabaseId(assistPin.el, msg.value, msg.retry));
      } catch (error) { reply({ error: error instanceof Error ? error.message : "Fill refused." }); }
      break;
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
  overlayStopped = true;
  surfaceObserver.disconnect();
  document.removeEventListener("toggle", onSurfaceToggle, true);
  calm.restore();
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("click", onClick, true);
  window.removeEventListener("resize", onViewportChange);
  document.removeEventListener("scroll", onViewportChange, true);
  clearInterval(urlTimer);
  clearTimeout(formTimer);
  setRecording(false);
  host.remove();
}

// A page loaded mid-Teach (navigation, reload, new tab) picks recording back up.
try {
  if (!isSensitivePage()) chrome.runtime.sendMessage({ kind: "teach_status" } satisfies FromPage)
    .then((res: { on?: boolean } | undefined) => { if (res?.on) setRecording(true); })
    .catch(() => {});
} catch {
  shutdown();
}
