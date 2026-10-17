// Messages between the side panel and the content script.
import type { DocumentSnapshot } from "./document.ts";
import type { TeachEvent } from "./teach/events.ts";
import type { CalmPreset } from "./calm.ts";

export type PageElement = { i: number; role: string; name: string; value?: string; section?: string };

export type PageSnapshot = { url: string; title: string; elements: PageElement[]; document?: DocumentSnapshot };

export type FormState = {
  url: string;
  labels: Record<string, string>; // label key → value, from the Labels section
  fields: Record<string, string>; // other named fields, e.g. "Service name", "Role"
  sections: string[]; // Rule sections present on the page, e.g. "Labels"
};

export type ViolationDetail = { field: string; message: string; severity: "block" | "warn" };

export type ToPage =
  | { kind: "read_page" }
  | { kind: "read_document" }
  | { kind: "highlight_document"; heading: string }
  | { kind: "highlight"; text: string; role?: string }
  | { kind: "customize"; preset: CalmPreset }
  | { kind: "read_form" }
  | { kind: "show_violations"; violations: ViolationDetail[] }
  | { kind: "show_field"; field: string }
  | { kind: "clear" }
  | { kind: "teach"; on: boolean };

export type FromPage =
  | { kind: "customize_event"; text: string }
  | { kind: "page_event"; text: string }
  | { kind: "form_changed"; form: FormState }
  | { kind: "submit_intent"; label: string; form: FormState }
  | { kind: "teach_event"; event: TeachEvent }
  | { kind: "teach_status" }; // a freshly loaded page asks whether to record; the side panel replies { on }

export type HighlightResult = { found: true; i: number; name: string } | { found: false; alternatives: string[] };
