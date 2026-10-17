import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origin.ts";

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
