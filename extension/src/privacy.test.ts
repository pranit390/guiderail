import { describe, expect, it } from "vitest";
import { isSensitiveUrl } from "./privacy.ts";

describe("sensitive origin exclusion", () => {
  it.each(["https://accounts.google.com/signin", "accounts.google.com/signin", "https://myaccount.google.com/", "https://passwords.google.com/", "https://sub.accounts.google.com/"])("excludes %s", (url) => {
    expect(isSensitiveUrl(url)).toBe(true);
  });
  it.each(["https://console.cloud.google.com/run", "http://localhost:8787/sandbox", "https://accounts.google.com.example.org/"])("allows %s", (url) => {
    expect(isSensitiveUrl(url)).toBe(false);
  });
});
