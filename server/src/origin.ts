// Write endpoints only accept requests from the extension, the server's own pages, or non-browser clients (no Origin).
export function isAllowedOrigin(origin?: string): boolean {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return /^chrome-extension:\/\/[a-p]{16,32}$/.test(origin) ||
      (url.origin === "http://localhost:8787" && origin === url.origin) ||
      (publicOrigin() !== undefined && origin === publicOrigin());
  } catch { return false; }
}

// The hosted coach's own HTTPS origin, from PUBLIC_ORIGIN; anything other than a bare https origin is ignored.
export function publicOrigin(): string | undefined {
  const value = process.env.PUBLIC_ORIGIN;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? value : undefined;
  } catch { return undefined; }
}
