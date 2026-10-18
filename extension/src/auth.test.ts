import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ firebaseKey: "test-key" }));
vi.mock("./config.ts", () => ({ get FIREBASE_API_KEY() { return config.firebaseKey; } }));

let stored: Record<string, unknown>;
const session = {
  get: vi.fn(async (key: string) => (key in stored ? { [key]: stored[key] } : {})),
  set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(stored, value); }),
  remove: vi.fn(async (key: string) => { delete stored[key]; }),
};
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signedIn = { idToken: "id-1", refreshToken: "refresh-1", expiresIn: "3600", email: "judge@example.com", localId: "u1" };

async function auth() { return import("./auth.ts"); }

beforeEach(() => {
  vi.resetModules();
  config.firebaseKey = "test-key";
  stored = {};
  Object.values(session).forEach((mock) => mock.mockClear());
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", { storage: { session } });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("demo sign-in", () => {
  it("is off when the build has no Firebase key", async () => {
    config.firebaseKey = "";
    const { authRequired, authFetch, getIdToken } = await auth();
    expect(authRequired()).toBe(false);
    expect(await getIdToken()).toBeNull();
    fetchMock.mockResolvedValue(json({ credential: "c" }));
    await authFetch("https://coach.example/session", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("https://coach.example/session", { method: "POST" });
  });

  it("signs in and stores the session without the password", async () => {
    fetchMock.mockResolvedValue(json(signedIn));
    const { authRequired, signIn, currentUser } = await auth();
    expect(authRequired()).toBe(true);
    expect(await signIn("judge@example.com", "s3cret-pass")).toEqual({ email: "judge@example.com" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-key");
    expect(JSON.parse(init.body)).toEqual({ email: "judge@example.com", password: "s3cret-pass", returnSecureToken: true });
    expect(stored.guiderailAuth).toMatchObject({ email: "judge@example.com", idToken: "id-1", refreshToken: "refresh-1" });
    expect(JSON.stringify(stored)).not.toContain("s3cret-pass");
    expect(await currentUser()).toEqual({ email: "judge@example.com" });
  });

  it.each([
    ["INVALID_LOGIN_CREDENTIALS", "Wrong email or password."],
    ["INVALID_PASSWORD", "Wrong email or password."],
    ["EMAIL_NOT_FOUND", "Wrong email or password."],
    ["USER_DISABLED", "This account is disabled."],
    ["TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled", "Too many attempts. Try again in a few minutes."],
  ])("maps %s to a plain message", async (code, message) => {
    fetchMock.mockResolvedValue(json({ error: { code: 400, message: code } }, 400));
    const { signIn } = await auth();
    await expect(signIn("judge@example.com", "wrong")).rejects.toThrow(message);
    expect(stored).toEqual({});
  });

  it("explains an unreachable sign-in service", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { signIn } = await auth();
    await expect(signIn("judge@example.com", "pw")).rejects.toThrow("Can't reach Google sign-in. Check your connection.");
  });

  it("refreshes the ID token when less than five minutes are left", async () => {
    stored.guiderailAuth = { email: "judge@example.com", idToken: "old", refreshToken: "refresh-1", expiresAt: Date.now() + 60_000 };
    fetchMock.mockResolvedValue(json({ id_token: "new", refresh_token: "refresh-2", expires_in: "3600", user_id: "u1" }));
    const { getIdToken, authHeaders } = await auth();
    expect(await getIdToken()).toBe("new");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://securetoken.googleapis.com/v1/token?key=test-key");
    expect(new URLSearchParams(init.body).get("refresh_token")).toBe("refresh-1");
    expect(new URLSearchParams(init.body).get("grant_type")).toBe("refresh_token");
    expect(stored.guiderailAuth).toMatchObject({ idToken: "new", refreshToken: "refresh-2" });
    expect(await authHeaders()).toEqual({ Authorization: "Bearer new" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the session when the refresh fails", async () => {
    stored.guiderailAuth = { email: "judge@example.com", idToken: "old", refreshToken: "revoked", expiresAt: Date.now() + 60_000 };
    fetchMock.mockResolvedValue(json({ error: { message: "TOKEN_EXPIRED" } }, 400));
    const { getIdToken, currentUser } = await auth();
    expect(await getIdToken()).toBeNull();
    expect(stored).toEqual({});
    expect(await currentUser()).toBeNull();
  });

  it("sends the Bearer token and maps 401 and 403 to the panel's sign-in messages", async () => {
    stored.guiderailAuth = { email: "judge@example.com", idToken: "id-1", refreshToken: "r", expiresAt: Date.now() + 3_600_000 };
    const { authFetch, onAuthLost, AuthError } = await auth();
    const lost = vi.fn();
    onAuthLost(lost);
    fetchMock.mockResolvedValueOnce(json({ credential: "c" }));
    await authFetch("https://coach.example/session", { method: "POST", headers: { "Content-Type": "application/json" } });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe("Bearer id-1");
    expect(headers.get("Content-Type")).toBe("application/json");

    fetchMock.mockResolvedValueOnce(json({ error: "not_allowed" }, 403));
    await expect(authFetch("https://coach.example/session")).rejects.toThrow("This account isn't allowed to use this GuideRail demo.");
    expect(lost).toHaveBeenLastCalledWith(expect.objectContaining({ code: "not_allowed" }));
    expect(stored).toEqual({});

    stored.guiderailAuth = { email: "judge@example.com", idToken: "id-2", refreshToken: "r", expiresAt: Date.now() + 3_600_000 };
    fetchMock.mockResolvedValueOnce(json({ error: "sign_in_required" }, 401));
    const error = await authFetch("https://coach.example/playbooks").catch((e) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe("Your sign-in expired. Please sign in again.");
    expect(stored).toEqual({});
  });

  it("signs out by clearing the stored session", async () => {
    stored.guiderailAuth = { email: "judge@example.com", idToken: "id-1", refreshToken: "r", expiresAt: Date.now() + 3_600_000 };
    const { signOut, currentUser } = await auth();
    await signOut();
    expect(stored).toEqual({});
    expect(await currentUser()).toBeNull();
  });
});
