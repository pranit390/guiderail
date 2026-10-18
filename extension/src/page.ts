import { STATES } from "./states.ts";

export const INTERACTIVE =
  'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=combobox],[role=option],[role=switch],[contenteditable=true],h1,h2,h3,h4,legend,[role=region][aria-label],section[aria-label]';

export function effectiveUrl(): string {
  // Sandbox pages declare which Google page they stand in for.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="guiderail-url"]');
  return meta?.content ?? location.host + location.pathname;
}

export function allElements(root: Document | ShadowRoot = document): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.localName === "guiderail-overlay") continue;
    if (el.matches(INTERACTIVE)) out.push(el);
    if (el.shadowRoot) out.push(...allElements(el.shadowRoot));
  }
  return out;
}

export function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
}

export function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function nameOf(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const t = labelledBy.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ").trim();
    if (t) return t;
  }
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return textOf(label);
  }
  const wrapping = el.closest("label");
  if (wrapping && wrapping !== el) return textOf(wrapping);
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder;
  const t = textOf(el);
  if (t) return t.slice(0, 80);
  return el.getAttribute("title") ?? "";
}

export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (/^h[1-4]$/.test(tag) || tag === "legend") return "heading";
  if (tag === "a") return "link";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "summary") return "button";
  if (tag === "section") return "region";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    return type === "checkbox" || type === "radio" ? type : type === "submit" || type === "button" ? "button" : "textbox";
  }
  return tag;
}

export function sectionOf(el: Element): string | undefined {
  const region = el.closest("section[aria-label],[role=region][aria-label],fieldset");
  if (region) {
    const legend = region.querySelector("legend");
    return region.getAttribute("aria-label") ?? (legend ? textOf(legend) : undefined);
  }
  const labelled = el.closest("section[aria-labelledby]");
  if (labelled) return textOf(document.getElementById(labelled.getAttribute("aria-labelledby")!));
  return undefined;
}

export function isSecret(el: Element): boolean {
  return el instanceof HTMLInputElement && (el.type === "password" || el.autocomplete.includes("password"));
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function findSection(title: string): Element | null {
  const heading = allElements().find((el) => roleOf(el) === "heading" && norm(textOf(el)) === norm(title));
  if (heading) return heading.closest("section,fieldset,[role=region]") ?? heading.parentElement;
  const tab = [...document.querySelectorAll('[role=tab][aria-selected="true"]')].find((t) => norm(textOf(t)) === norm(title));
  const panelId = tab?.getAttribute("aria-controls");
  if (panelId) return document.getElementById(panelId);
  return document.querySelector(`section[aria-label="${title}"],[role=region][aria-label="${title}"]`);
}

// Controls whose value is shown on screen but that aren't native form fields (custom dropdowns,
// toggles, sliders). If it's visible, GuideRail should be able to read it.
export const CUSTOM_FIELD =
  '[role=combobox],[aria-haspopup=listbox],[role=spinbutton],[role=slider],[role=checkbox],[role=radio],[role=switch]';

// The value a person sees in a control, or undefined if it shows none.
export function valueOf(el: Element): string | undefined {
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent?.trim() || el.value || undefined;
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? "checked" : undefined;
    return el.value || undefined;
  }
  if (el instanceof HTMLTextAreaElement) return el.value || undefined;
  const checked = el.getAttribute("aria-checked");
  if (checked !== null) return checked === "true" ? "checked" : undefined;
  const valueText = el.getAttribute("aria-valuetext") ?? el.getAttribute("aria-valuenow");
  if (valueText) return valueText;
  if (el.matches(CUSTOM_FIELD)) {
    const shown = textOf(el);
    const name = nameOf(el);
    const value = name && shown.startsWith(name) ? shown.slice(name.length).trim() : shown;
    return value && value !== name ? value.slice(0, 80) : undefined;
  }
  return undefined;
}

// --- Calm edge colours: the outline carries contrast (>=3:1), the halo is only attention. ---
export const EDGE_LIGHT = STATES.go.light; // 5.38:1 on #fff
export const EDGE_DARK = STATES.go.dark;
export const BAD_LIGHT = STATES.stop.light;
export const BAD_DARK = STATES.stop.dark;

export function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseRgb(a.startsWith("#") ? hexToRgb(a) : a);
  const cb = parseRgb(b.startsWith("#") ? hexToRgb(b) : b);
  if (!ca || !cb) return 0;
  const [l1, l2] = [relativeLuminance(ca), relativeLuminance(cb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function hexToRgb(hex: string): string {
  const h = hex.slice(1);
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

/** Surrounding background behind an element, walking up until a non-transparent colour. */
export function surroundingBackground(el: Element): string {
  let cur: Element | null = el.parentElement;
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor;
    if (parseRgb(bg)) return bg;
    cur = cur.parentElement;
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return parseRgb(bodyBg) ? bodyBg : "rgb(255,255,255)";
}

export function isDarkSurrounding(el: Element): boolean {
  const rgb = parseRgb(surroundingBackground(el));
  return rgb ? relativeLuminance(rgb) < 0.18 : false;
}

/** Value input for a `label:<key>` Violation: the input paired with the key input holding <key>. Never the whole section. */
export function labelValueInput(key: string): Element | null {
  const section = findSection("Labels");
  if (!section) return null;
  const inputs = [...section.querySelectorAll("input")].filter((i) => i.type === "text" || i.type === "");
  for (let k = 0; k + 1 < inputs.length; k += 2) {
    if (inputs[k].value.trim() === key) return inputs[k + 1];
  }
  return null;
}

/** Exact element for a Violation field. Generic fields match the observed accessible name (the real control), never a guessed label. */
export function violationFieldElement(field: string): Element | null {
  if (field.startsWith("label:")) return labelValueInput(field.slice("label:".length));
  const candidates = [...document.querySelectorAll(`input,select,textarea,${CUSTOM_FIELD},[role=radio],[role=checkbox],[role=switch]`)];
  return candidates.find((e) => norm(nameOf(e)) === norm(field)) ?? null;
}

export function violationFieldLabel(field: string): string {
  return field.startsWith("label:") ? `${field.slice("label:".length)} value` : field;
}

// The field a dropdown option belongs to: the control that owns its listbox.
export function fieldForOption(option: Element): Element | null {
  const list = option.closest("[role=listbox]");
  const id = list?.id;
  if (id) {
    const owner = document.querySelector(`[aria-controls~="${CSS.escape(id)}"],[aria-owns~="${CSS.escape(id)}"]`);
    if (owner) return owner;
  }
  return null;
}
