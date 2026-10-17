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
