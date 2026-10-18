/** Read once at startup so admission and the relay enforce the same limits. */
function duration(name: string, fallback: number, maximum: number, unitMs: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback * unitMs;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`${name} must be a positive finite number; using default ${fallback}.`);
    return fallback * unitMs;
  }
  if (value > maximum) console.warn(`${name} exceeds maximum ${maximum}; clamping to ${maximum}.`);
  return Math.min(value, maximum) * unitMs;
}

export const DAILY_LIVE_MS = duration("LIVE_DAILY_MINUTES", 18, 60, 60_000);
export const SESSION_MS = duration("LIVE_SESSION_MINUTES", 20, 30, 60_000);
export const IDLE_MS = duration("LIVE_IDLE_SECONDS", 120, 300, 1000);
