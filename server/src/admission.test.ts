import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIVE_MS, LiveAdmission, SessionTickets } from "./admission.ts";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

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
