// Records what the expert does, by meaning. Never reads passwords; masks secret-looking values.
import { effectiveUrl, fieldForOption, isSecret, nameOf, roleOf, sectionOf, textOf } from "../page.ts";
import { isSecretField, MASK, maskValue, type Target, type TeachEvent } from "./events.ts";

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

const DROPDOWN = '[role=combobox],[aria-haspopup=listbox],[aria-haspopup=true],[aria-haspopup=menu]';
const TOGGLE = '[role=checkbox],[role=switch],[role=radio]';
let lastDropdown: Element | null = null; // the custom dropdown the expert last opened

function choice(field: Element, value: string) {
  const target = describe(field);
  const secret = isSecretField(target);
  emit?.({ t: "field", at: Date.now(), url: effectiveUrl(), target, value: secret ? MASK : maskValue(value) });
}

function onClick(e: Event) {
  const clicked = e.target as Element;
  if (!emit || ours(clicked)) return;

  // Picking from a custom dropdown (a list of options, not a <select>) is a choice, like a field change.
  const option = clicked.closest("[role=option],[role=menuitemradio],[role=listbox] li");
  if (option) {
    const field = fieldForOption(option) ?? lastDropdown;
    lastDropdown = null;
    if (field) return choice(field, textOf(option));
  }

  // A custom toggle (not a native checkbox/radio) reports its new state once the click has applied.
  const toggle = clicked.closest(TOGGLE);
  if (toggle && !(toggle instanceof HTMLInputElement)) {
    setTimeout(() => choice(toggle, toggle.getAttribute("aria-checked") === "true" ? "checked" : "unchecked"), 0);
    return;
  }

  const dropdown = clicked.closest(DROPDOWN);
  if (dropdown) lastDropdown = dropdown;

  const el = clicked.closest(CLICKABLE);
  if (!el) return;
  emit({ t: "click", at: Date.now(), url: effectiveUrl(), title: document.title, target: describe(el) });
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (!emit || ours(el) || isSecret(el) || !("value" in el)) return;
  // Same shape the guard reads (page.ts valueOf): a radio or checkbox is its own field, "checked" or not.
  const toggle = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");
  const value = toggle ? (el.checked ? "checked" : "unchecked")
    : el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent?.trim() ?? el.value : el.value;
  const target = describe(el);
  emit({ t: "field", at: Date.now(), url: effectiveUrl(), target, value: isSecretField(target) ? MASK : maskValue(value) });
}

export function startRecording(send: (e: TeachEvent) => void) {
  stopRecording();
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
