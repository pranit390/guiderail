import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIVE_MS, LiveAdmission, MODEL_CALL_MS, SessionTickets } from "./admission.ts";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("demo admission", () => {
  it("admits three clients, tells the fourth the coach is busy, and reclaims a closed slot", () => {
    const limits = new LiveAdmission();
    const first = limits.admit(vi.fn());
    expect(first.allowed).toBe(true);
    expect(limits.admit(vi.fn()).allowed).toBe(true);
    expect(limits.admit(vi.fn()).allowed).toBe(true);
    expect(limits.admit(vi.fn())).toMatchObject({ allowed: false, message: expect.stringContaining("coach is busy") });
    if (first.allowed) first.release();
    expect(limits.admit(vi.fn()).allowed).toBe(true);
  });

  it("charges aggregate concurrent duration and closes all sessions at the daily allowance", () => {
    expect(DAILY_LIVE_MS).toBe(18 * 60_000);
    const limits = new LiveAdmission();
    const expired = vi.fn();
    for (let i = 0; i < 3; i++) limits.admit(expired);
    vi.advanceTimersByTime(DAILY_LIVE_MS / 3);
    expect(expired).toHaveBeenCalledTimes(3);
    expect(limits.admit(vi.fn())).toMatchObject({ allowed: false, message: expect.stringContaining("tomorrow") });
  });

  it("retains consumed minutes on disconnect and restores the allowance on the next UTC day", () => {
    const limits = new LiveAdmission();
    const first = limits.admit(vi.fn());
    vi.advanceTimersByTime(60_000);
    if (first.allowed) { first.release(); first.release(); }
    const expired = vi.fn();
    limits.admit(expired);
    vi.advanceTimersByTime(DAILY_LIVE_MS - 60_000);
    expect(expired).toHaveBeenCalledOnce();
    expect(limits.admit(vi.fn()).allowed).toBe(false);
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    expect(limits.admit(vi.fn()).allowed).toBe(true);
  });
});

describe("configured admission limits", () => {
  it("enforces an overridden daily allowance across concurrent clients", async () => {
    vi.stubEnv("LIVE_DAILY_MINUTES", "2");
    vi.stubEnv("LIVE_SESSION_MINUTES", "20");
    vi.resetModules();
    const { LiveAdmission } = await import("./admission.ts");
    const limits = new LiveAdmission();
    const expired = vi.fn();
    limits.admit(expired);
    limits.admit(expired);
    vi.advanceTimersByTime(60_000 - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(2);
    expect(limits.admit(vi.fn()).allowed).toBe(false);
  });

  it.each([
    { session: undefined, minutes: 20 },
    { session: "2", minutes: 2 },
  ])("expires admission at $minutes minutes and keeps unused daily time", async ({ session, minutes }) => {
    vi.stubEnv("LIVE_DAILY_MINUTES", "60");
    vi.stubEnv("LIVE_SESSION_MINUTES", session);
    vi.resetModules();
    const { LiveAdmission } = await import("./admission.ts");
    const limits = new LiveAdmission();
    const expired = vi.fn();
    limits.admit(expired);
    vi.advanceTimersByTime(minutes * 60_000 - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledOnce();
    expect(limits.admit(vi.fn()).allowed).toBe(true);
  });
});

describe("model calls share the daily allowance", () => {
  it("charges each draft or compile and refuses once the allowance is used, until the next UTC day", () => {
    const limits = new LiveAdmission();
    const calls = DAILY_LIVE_MS / MODEL_CALL_MS;
    for (let i = 0; i < calls; i++) expect(limits.charge(MODEL_CALL_MS)).toBe(true);
    expect(limits.charge(MODEL_CALL_MS)).toBe(false);
    expect(limits.admit(vi.fn())).toMatchObject({ allowed: false, message: expect.stringContaining("tomorrow") });
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    expect(limits.charge(MODEL_CALL_MS)).toBe(true);
  });

  it("voice time used today leaves less room for drafts", () => {
    const limits = new LiveAdmission();
    const voice = limits.admit(vi.fn());
    vi.advanceTimersByTime(DAILY_LIVE_MS - MODEL_CALL_MS);
    if (voice.allowed) voice.release();
    expect(limits.charge(MODEL_CALL_MS)).toBe(true);
    expect(limits.charge(MODEL_CALL_MS)).toBe(false);
  });
});

describe("anonymous session capabilities", () => {
  it("requires the issuing origin, rejects missing/invalid credentials and prevents replay", () => {
    const tickets = new SessionTickets();
    const ticket = tickets.issue("chrome-extension://abcdefghijklmnop");
    expect(ticket).toBeDefined();
    if (!ticket) throw new Error("ticket not issued");
    expect(tickets.consume(null, "chrome-extension://abcdefghijklmnop")).toBeUndefined();
    expect(tickets.consume("invalid", "chrome-extension://abcdefghijklmnop")).toBeUndefined();
    expect(tickets.consume(ticket.credential, "https://evil.example")).toBeUndefined();
    expect(tickets.consume(ticket.credential, "chrome-extension://abcdefghijklmnop")).toBe(ticket.anonymousId);
    expect(tickets.consume(ticket.credential, "chrome-extension://abcdefghijklmnop")).toBeUndefined();
  });

  it("expires after one minute and bounds outstanding issuance", () => {
    const tickets = new SessionTickets();
    const ticket = tickets.issue("https://coach.example");
    if (!ticket) throw new Error("ticket not issued");
    for (let i = 1; i < 128; i++) expect(tickets.issue("https://coach.example")).toBeDefined();
    expect(tickets.issue("https://coach.example")).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(tickets.consume(ticket.credential, "https://coach.example")).toBeUndefined();
    expect(tickets.issue("https://coach.example")).toBeDefined();
  });
});

describe("SessionTickets bound to a signed-in user", () => {
  const origin = "chrome-extension://abcdefghijklmnop";
  it("only the user it was issued to can use it", () => {
    const tickets = new SessionTickets();
    const ticket = tickets.issue(origin, "judge-uid")!;
    expect(tickets.consume(ticket.credential, origin)).toBeUndefined();
    expect(tickets.consume(ticket.credential, origin, "someone-else")).toBeUndefined();
    expect(tickets.consume(ticket.credential, origin, "judge-uid")).toBe(ticket.anonymousId);
    expect(tickets.consume(ticket.credential, origin, "judge-uid")).toBeUndefined();
  });
});
