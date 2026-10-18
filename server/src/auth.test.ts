import { describe, expect, it } from "vitest";
import { authMode, authorize, type VerifyToken } from "./auth.ts";

const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv;
const allowed = env({ ALLOWED_EMAILS: "person@example.com" });
const verified: VerifyToken = async () => ({ uid: "uid", email: "person@example.com", emailVerified: true });

describe("authMode", () => {
  it("requires sign-in when allowed emails are configured", () => {
    expect(authMode(env({ ALLOWED_EMAILS: "person@example.com" }))).toBe("required");
  });

  it("is off locally without allowed emails", () => {
    expect(authMode(env({}))).toBe("off");
  });

  it("fails closed on Cloud Run without allowed emails", () => {
    expect(authMode(env({ K_SERVICE: "coach" }))).toBe("closed");
  });
});

describe("authorize", () => {
  it.each([undefined, "Basic token"])("rejects a missing or non-Bearer header", async (header) => {
    await expect(authorize(header, verified, allowed)).resolves.toMatchObject({ ok: false, status: 401 });
  });

  it("rejects an invalid token", async () => {
    await expect(authorize("Bearer token", async () => { throw new Error("invalid"); }, allowed)).resolves.toMatchObject({ ok: false, status: 401 });
  });

  it("rejects an email outside the allowlist", async () => {
    await expect(authorize("Bearer token", async () => ({ uid: "uid", email: "other@example.com", emailVerified: true }), allowed)).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("rejects an unverified email", async () => {
    await expect(authorize("Bearer token", async () => ({ uid: "uid", email: "person@example.com", emailVerified: false }), allowed)).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("accepts a verified email regardless of allowlist case or whitespace", async () => {
    const result = await authorize("bearer token", async () => ({ uid: "uid", email: " Person@Example.Com ", emailVerified: true }), env({ ALLOWED_EMAILS: "  PERSON@example.com  " }));
    expect(result).toEqual({ ok: true, email: " Person@Example.Com " });
  });
});
