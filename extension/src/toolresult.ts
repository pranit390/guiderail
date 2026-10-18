// The relay ends the session when one tool result's id + name + JSON response exceeds 4,000
// characters (server/src/live.ts). Results are fitted under that with margin before sending.
export const TOOL_RESULT_LIMIT = 3_600;

export const toolResultSize = (id: string, name: string, response: unknown) =>
  id.length + name.length + JSON.stringify(response).length;

export function fitToolResult(id: string, name: string, response: Record<string, unknown>): Record<string, unknown> {
  if (toolResultSize(id, name, response) <= TOOL_RESULT_LIMIT) return response;
  const elements = response.elements;
  if (Array.isArray(elements)) {
    const total = elements.length;
    // Page reads keep the first controls in page order and say how many were left out.
    for (let shown = total - 1; shown >= 0; shown--) {
      const trimmed = {
        ...response,
        elements: elements.slice(0, shown),
        truncated: { shown, total, note: `Only the first ${shown} of ${total} controls fit in this read.` },
      };
      if (toolResultSize(id, name, trimmed) <= TOOL_RESULT_LIMIT) return trimmed;
    }
  }
  return { error: `The ${name} result was too large to send.` };
}
