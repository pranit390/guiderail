// Messages between the side panel and the content script.
import type { DocumentSnapshot } from "./document.ts";
import type { TeachEvent } from "./teach/events.ts";
import type { CalmPreset } from "./calm.ts";

export type PageElement = { i: number; role: string; name: string; value?: string; section?: string };

// rank[k] orders elements[k] for trimming an oversized read: lower is kept first.
export type PageSnapshot = { url: string; title: string; elements: PageElement[]; generation: number; document?: DocumentSnapshot; rank?: number[] };

export type FormState = {
  url: string;
  labels: Record<string, string>; // label key → value, from the Labels section
  fields: Record<string, string>; // other named fields, e.g. "Service name", "Role"
  sections: string[]; // Rule sections present on the page, e.g. "Labels"
};

export type ViolationDetail = { field: string; message: string; severity: "block" | "warn" };

export type ToPage = (
  | { kind: "read_page" }
  | { kind: "read_document" }
  | { kind: "highlight_document"; heading: string }
  | { kind: "highlight"; text: string; role?: string; section?: string; generation?: number; index?: number; name?: string }
  | { kind: "clear_highlight" }
  | { kind: "customize"; preset: CalmPreset }
  | { kind: "read_form" }
  | { kind: "show_violations"; violations: ViolationDetail[] }
  | { kind: "show_field"; field: string }
  | { kind: "clear" }
  | { kind: "teach"; on: boolean }
) & { expectedUrl?: string };

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
