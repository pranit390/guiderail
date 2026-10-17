// Messages between the side panel and the content script.
import type { TeachEvent } from "./teach/events.ts";
import type { CalmPreset } from "./calm.ts";

export type PageElement = { i: number; role: string; name: string; value?: string; section?: string };

export type PageSnapshot = { url: string; title: string; elements: PageElement[]; generation: number };

export type FormState = {
  url: string;
  labels: Record<string, string>; // label key → value, from the Labels section
  fields: Record<string, string>; // other named fields, e.g. "Service name", "Role"
  sections: string[]; // Rule sections present on the page, e.g. "Labels"
};

export type ViolationDetail = { field: string; message: string; severity: "block" | "warn" };

export type ToPage =
  | { kind: "read_page" }
  | { kind: "highlight"; text: string; role?: string; generation?: number; index?: number; name?: string }
  | { kind: "customize"; preset: CalmPreset }
  | { kind: "read_form" }
  | { kind: "show_violations"; violations: ViolationDetail[] }
  | { kind: "show_field"; field: string }
  | { kind: "clear" }
  | { kind: "teach"; on: boolean };

export type FromPage =
  | { kind: "customize_event"; text: string }
  | { kind: "page_event"; text: string; generation?: number }
  | { kind: "form_changed"; form: FormState }
  | { kind: "submit_intent"; label: string; form: FormState }
  | { kind: "teach_event"; event: TeachEvent }
  | { kind: "teach_status" }; // a freshly loaded page asks whether to record; the side panel replies { on }

export type HighlightResult =
  | { found: true; i: number; name: string; confidence: number }
  | { found: false; reason: "ambiguous"; alternatives: string[]; ask: string }
  | { found: false; reason: "missing"; alternatives: string[]; mismatch: string; citation?: string }
  | { found: false; reason: "stale" | "wrong_tab" | "unbound"; alternatives: string[] };
