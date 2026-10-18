// The relay ends the session when one tool result's id + name + JSON response exceeds 4,000
// characters (server/src/live.ts). Results are fitted under that with margin before sending.
import type { PageElement } from "./messages.ts";

export const TOOL_RESULT_LIMIT = 3_600;

export const toolResultSize = (id: string, name: string, response: unknown) =>
  id.length + name.length + JSON.stringify(response).length;

// `rank` is a local trimming hint for page reads and is never sent.
export function fitToolResult(id: string, name: string, { rank, ...response }: Record<string, unknown>): Record<string, unknown> {
  if (toolResultSize(id, name, response) <= TOOL_RESULT_LIMIT) return response;
  if (Array.isArray(response.elements)) {
    const elements = response.elements as PageElement[];
    const total = elements.length;
    const order = Array.isArray(rank) ? (rank as number[]) : [];
    const place: number[] = [];
    elements.map((_, k) => k).sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0) || a - b).forEach((k, p) => { place[k] = p; });
    for (let shown = total - 1; shown >= 0; shown--) {
      const trimmed = {
        ...response,
        elements: withoutRepeatedSections(elements.filter((_, k) => place[k] < shown)),
        truncated: {
          shown,
          total,
          note: `Only ${shown} of ${total} controls fit in this read, form controls first. A control without a section is in the same section as the control before it; "" means no section.`,
        },
      };
      if (toolResultSize(id, name, trimmed) <= TOOL_RESULT_LIMIT) return trimmed;
    }
  }
  return { error: `The ${name} result was too large to send.` };
}

function withoutRepeatedSections(elements: PageElement[]): PageElement[] {
  let previous: string | undefined;
  return elements.map((e) => {
    const repeated = e.section === previous;
    const unsectioned = e.section === undefined && previous !== undefined;
    previous = e.section;
    if (repeated) { const { section: _, ...rest } = e; return rest; }
    return unsectioned ? { ...e, section: "" } : e;
  });
}
