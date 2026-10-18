import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAdmission, MODEL_CALL_MS, SessionTickets } from "./admission.ts";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("no admission caps", () => {
  it("admits any number of sessions and never refuses model calls", () => {
    const limits = new LiveAdmission();
    const expired = vi.fn();
    for (let i = 0; i < 10; i++) expect(limits.admit(expired).allowed).toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(expired).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++) expect(limits.charge(MODEL_CALL_MS)).toBe(true);
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
