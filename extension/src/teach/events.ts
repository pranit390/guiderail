// What a Teach session records. Elements are described by meaning, never by position or CSS.
export type Target = { role: string; name: string; section?: string };

export type TeachEvent =
  | { t: "click"; at: number; url: string; title: string; target: Target }
  | { t: "navigate"; at: number; url: string; title: string }
  | { t: "field"; at: number; url: string; target: Target; value: string }
  | { t: "narration"; at: number; text: string }
  | { t: "answer"; at: number; question: string; text: string };

export const MASK = "«masked»";
export const MAX_EVENTS = 500;

const SECRET_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{16,}/, // API secret keys
  /^AIza[0-9A-Za-z_-]{20,}/, // Google API keys
  /^eyJ[\w-]+\.[\w-]+\.[\w-]+/, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM
  /^[A-Fa-f0-9]{32,}$/, // long hex tokens
  /^[A-Za-z0-9+/=_-]{40,}$/, // long base64-ish tokens with no spaces
];

export function maskValue(value: string): string {
  return SECRET_PATTERNS.some((p) => p.test(value.trim())) ? MASK : value;
}

const sameTarget = (a: TeachEvent, b: TeachEvent) =>
  a.t === "field" && b.t === "field" && a.url === b.url && a.target.name === b.target.name && a.target.section === b.target.section;

export function compact(events: TeachEvent[], max = MAX_EVENTS): TeachEvent[] {
  const out: TeachEvent[] = [];
  for (const e of events) {
    const last = out.at(-1);
    if (last && sameTarget(last, e)) out[out.length - 1] = e;
    else out.push(e);
  }
  return out.length > max ? out.slice(-max) : out;
}
