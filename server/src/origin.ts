// Write endpoints only accept requests from the extension, the server's own pages, or non-browser clients (no Origin).
export function isAllowedOrigin(origin?: string): boolean {
  if (origin === undefined) return true;
  return origin.startsWith("chrome-extension://") || origin.startsWith("http://localhost:8787");
}
