// Write endpoints only accept requests from the extension, the server's own pages, or non-browser clients (no Origin).
export function isAllowedOrigin(origin?: string): boolean {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return /^chrome-extension:\/\/[a-p]{16,32}$/.test(origin) ||
      (url.origin === "http://localhost:8787" && origin === url.origin) ||
      (process.env.PUBLIC_ORIGIN !== undefined && origin === new URL(process.env.PUBLIC_ORIGIN).origin);
  } catch { return false; }
}
