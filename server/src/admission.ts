import { randomBytes, randomUUID } from "node:crypto";
import { DAILY_LIVE_MS, SESSION_MS } from "./live-limits.ts";

export { DAILY_LIVE_MS, SESSION_MS } from "./live-limits.ts";

const MINUTE = 60_000;
// What one non-Live Gemini call (a Teach draft, an uncached Journey compile) takes from the daily allowance.
export const MODEL_CALL_MS = 30_000;
export const ALLOWANCE_USED = "Today's demo allowance is used. Please try again tomorrow (UTC).";

type Admission = { allowed: true; release: () => void } | { allowed: false; message: string };

/** Deliberately instance-local: replacements reset the demo allowance. */
export class LiveAdmission {
  private day = new Date().toISOString().slice(0, 10);
  private last = Date.now();
  private used = 0;
  private active = new Map<symbol, { started: number; expire: () => void }>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  private settle() {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) {
      const midnight = Date.parse(`${day}T00:00:00Z`);
      this.used = Math.max(0, now - midnight) * this.active.size;
      this.day = day;
    } else this.used += (now - this.last) * this.active.size;
    this.last = now;
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.active.size) return;
    const now = Date.now();
    const remaining = Math.max(0, DAILY_LIVE_MS - this.used);
    const oldest = Math.min(...[...this.active.values()].map((session) => session.started));
    const midnight = Date.parse(`${this.day}T00:00:00Z`) + 24 * 60 * MINUTE;
    this.timer = setTimeout(() => {
      this.settle();
      for (const [id, session] of this.active) {
        if (this.used >= DAILY_LIVE_MS || Date.now() - session.started >= SESSION_MS) {
          this.active.delete(id);
          session.expire();
        }
      }
      this.schedule();
    }, Math.max(1, Math.min(remaining / this.active.size, SESSION_MS - (now - oldest), midnight - now)));
    this.timer.unref();
  }

  // Charge a non-Live model call to the same daily allowance as voice; false once it's used up.
  charge(ms: number): boolean {
    this.settle();
    if (this.used >= DAILY_LIVE_MS) return false;
    this.used += ms;
    this.schedule();
    return true;
  }

  admit(expire: () => void): Admission {
    this.settle();
    if (this.active.size >= 3) return { allowed: false, message: "The coach is busy. Three sessions are already active; please retry shortly." };
    if (this.used >= DAILY_LIVE_MS) return { allowed: false, message: "Today's demo voice allowance is used. Please try again tomorrow (UTC)." };
    const id = Symbol();
    this.active.set(id, { started: Date.now(), expire });
    this.schedule();
    return { allowed: true, release: () => {
      this.settle();
      this.active.delete(id);
      this.schedule();
    } };
  }
}

/** One-use, 60-second capabilities bound to a fresh anonymous identity and Origin. */
export class SessionTickets {
  private tickets = new Map<string, { origin: string; expires: number; anonymousId: string; uid?: string }>();

  // uid: the signed-in Firebase user the ticket belongs to (none when sign-in is off).
  issue(origin: string, uid?: string) {
    for (const [token, ticket] of this.tickets) if (ticket.expires <= Date.now()) this.tickets.delete(token);
    if (this.tickets.size >= 128) return undefined;
    const credential = randomBytes(32).toString("base64url");
    const ticket = { origin, expires: Date.now() + MINUTE, anonymousId: randomUUID(), ...(uid ? { uid } : {}) };
    this.tickets.set(credential, ticket);
    return { credential, anonymousId: ticket.anonymousId, expiresAt: ticket.expires };
  }

  // A ticket issued to a signed-in user is only valid for that same user.
  consume(token: string | null, origin: string | undefined, uid?: string) {
    if (!token || !origin) return undefined;
    const ticket = this.tickets.get(token);
    if (!ticket || ticket.origin !== origin || ticket.expires <= Date.now()) return undefined;
    if (ticket.uid !== undefined && ticket.uid !== uid) return undefined;
    this.tickets.delete(token);
    return ticket.anonymousId;
  }
}
