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
