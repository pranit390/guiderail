import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedOrigin, publicOrigin } from "./origin.ts";

afterEach(() => vi.unstubAllEnvs());

describe("isAllowedOrigin", () => {
  it("allows requests without an Origin (curl, tests)", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
  it("allows the extension and the local server", () => {
    expect(isAllowedOrigin("chrome-extension://abcdefghijklmnop")).toBe(true);
    expect(isAllowedOrigin("http://localhost:8787")).toBe(true);
  });
  it.each(["https://evil.example", "http://localhost:3000", "http://localhost:8787.evil.example", "http://localhost:8787/path", "chrome-extension://", "chrome-extension://invalid-id", "null", "", "https://console.cloud.google.com"])("rejects %j", (o) => {
    expect(isAllowedOrigin(o)).toBe(false);
  });
});

describe("publicOrigin", () => {
  it("accepts only a bare HTTPS origin", () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://coach.example");
    expect(publicOrigin()).toBe("https://coach.example");
    expect(isAllowedOrigin("https://coach.example")).toBe(true);
  });
  it.each(["http://coach.example", "https://coach.example/", "https://coach.example/path", "not a url"])("ignores %j", (value) => {
    vi.stubEnv("PUBLIC_ORIGIN", value);
    expect(publicOrigin()).toBeUndefined();
    expect(isAllowedOrigin(value)).toBe(false);
  });
});
