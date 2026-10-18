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

// Matched anywhere in the value, so a secret pasted inside a longer command or sentence is still caught.
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // API secret keys
  /\bsk_(live|test)_[A-Za-z0-9]{8,}/, // Stripe keys
  /\bAIza[0-9A-Za-z_-]{20,}/, // Google API keys
  /\bAKIA[0-9A-Z]{16}/, // AWS access key ids
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /Bearer\s+\S{12,}/i, // Authorization headers
  /:\/\/[^/\s:@]+:[^@\s]+@/, // credentials in a URL
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM
  /(?:^|\s)[A-Fa-f0-9]{32,}(?=\s|$)/, // long hex tokens
  /(?:^|\s)[A-Za-z0-9+/=_-]{40,}(?=\s|$)/, // long base64-ish tokens, as a whole word
];

export function maskValue(value: string): string {
  return SECRET_PATTERNS.some((p) => p.test(value)) ? MASK : value;
}

// Fields whose value is always secret, whatever it looks like.
const SECRET_FIELD = /pass(word|code)?|secret|token|credential|api[\s_-]*key|access[\s_-]*key|private[\s_-]*key|otp|one[\s_-]*time[\s_-]*(password|code)|verification[\s_-]*code|(?:recovery|seed|wallet|backup)[\s_-]*(?:code|phrase|key)|mnemonic|cookie|security[\s_-]*(?:answer|question)|auth(?:entication)?[\s_-]*code/i;
export function isSecretField(target: { name: string; section?: string }): boolean {
  return SECRET_FIELD.test(target.name) || SECRET_FIELD.test(target.section ?? "") || target.section === "Variables & Secrets";
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
