import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  for (const name of ["LIVE_DAILY_MINUTES", "LIVE_SESSION_MINUTES", "LIVE_IDLE_SECONDS"]) vi.stubEnv(name, undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("uses the demo defaults without a warning when env is absent", async () => {
  const limits = await import("./live-limits.ts");
  expect(limits.DAILY_LIVE_MS).toBe(18 * 60_000);
  expect(limits.SESSION_MS).toBe(20 * 60_000);
  expect(limits.IDLE_MS).toBe(120_000);
  expect(console.warn).not.toHaveBeenCalled();
});

describe.each([
  { name: "LIVE_DAILY_MINUTES", key: "DAILY_LIVE_MS", fallback: 18, maximum: 60, unit: 60_000 },
  { name: "LIVE_SESSION_MINUTES", key: "SESSION_MS", fallback: 20, maximum: 30, unit: 60_000 },
  { name: "LIVE_IDLE_SECONDS", key: "IDLE_MS", fallback: 120, maximum: 300, unit: 1000 },
] as const)("$name startup configuration", ({ name, key, fallback, maximum, unit }) => {
  it("accepts a positive fractional override", async () => {
    vi.stubEnv(name, " 1.5 ");
    expect((await import("./live-limits.ts"))[key]).toBe(1.5 * unit);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["", " ", "0", "-1", "abc", "18minutes", "NaN", "Infinity", "-Infinity", "1e309"])("falls back and warns for %j", async (value) => {
    vi.stubEnv(name, value);
    expect((await import("./live-limits.ts"))[key]).toBe(fallback * unit);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`${name} must be a positive finite number; using default ${fallback}.`);
  });

  it("clamps an excessive finite override", async () => {
    vi.stubEnv(name, "999999999");
    expect((await import("./live-limits.ts"))[key]).toBe(maximum * unit);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`${name} exceeds maximum ${maximum}; clamping to ${maximum}.`);
  });
});
