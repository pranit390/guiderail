// Messages between the side panel and the content script.

export type PageElement = { i: number; role: string; name: string; value?: string; section?: string };

export type PageSnapshot = { url: string; title: string; elements: PageElement[] };

export type FormState = {
  url: string;
  labels: Record<string, string>; // label key → value, from the Labels section
  fields: Record<string, string>; // other named fields, e.g. "Service name", "Role"
  sections: string[]; // Rule sections present on the page, e.g. "Labels"
};

export type ToPage =
  | { kind: "read_page" }
  | { kind: "highlight"; text: string; role?: string }
  | { kind: "read_form" }
  | { kind: "show_violations"; fields: string[]; submitLabel?: string }
  | { kind: "clear" };

export type FromPage =
  | { kind: "page_event"; text: string }
  | { kind: "form_changed"; form: FormState }
  | { kind: "submit_intent"; label: string; form: FormState };

export type HighlightResult = { found: true; i: number; name: string } | { found: false; alternatives: string[] };
