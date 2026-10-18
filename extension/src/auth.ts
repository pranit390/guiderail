// Demo sign-in: a Firebase Auth email/password account over the REST API (no SDK). The coach checks the ID token.
// The session lives in chrome.storage.session, so it ends when Chrome closes. The password is never stored.
import { FIREBASE_API_KEY } from "./config.ts";

const STORE = "guiderailAuth";
// Refresh the ID token when less than this is left, so a request never carries one about to expire.
const REFRESH_MARGIN = 5 * 60_000;
const SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token";

export const EXPIRED_MESSAGE = "Your sign-in expired. Please sign in again.";
export const NOT_ALLOWED_MESSAGE = "This account isn't allowed to use this GuideRail demo.";
const NETWORK_MESSAGE = "Can't reach Google sign-in. Check your connection.";

type Session = { email: string; idToken: string; refreshToken: string; expiresAt: number };

export class AuthError extends Error {
  constructor(readonly code: "sign_in_required" | "not_allowed", message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Sign-in is off for local development builds, which have no Firebase key.
export const authRequired = () => FIREBASE_API_KEY !== "";

let lostListener: ((error: AuthError) => void) | undefined;
// Called when the coach rejects the token, so the panel can show the sign-in form again.
export function onAuthLost(listener: (error: AuthError) => void) { lostListener = listener; }

// Bumped on sign-in and sign-out so a refresh that finishes late cannot restore an old session.
let generation = 0;
let refreshing: Promise<string | null> | undefined;

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.email === "string" && typeof s.idToken === "string" && typeof s.refreshToken === "string" && typeof s.expiresAt === "number";
}

async function load(): Promise<Session | null> {
  const stored = (await chrome.storage.session.get(STORE).catch(() => ({} as Record<string, unknown>)))[STORE];
  return isSession(stored) ? stored : null;
}

const save = (session: Session) => chrome.storage.session.set({ [STORE]: session });
const clear = () => chrome.storage.session.remove(STORE).catch(() => {});
const expiresAt = (seconds: unknown) => Date.now() + (Number(seconds) > 0 ? Number(seconds) : 3600) * 1000;

function signInMessage(code: unknown): string {
  // Firebase codes may carry detail after the code, e.g. "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account…".
  const name = typeof code === "string" ? code.split(/[\s:]/)[0] : "";
  switch (name) {
    case "INVALID_LOGIN_CREDENTIALS":
    case "INVALID_PASSWORD":
    case "EMAIL_NOT_FOUND": return "Wrong email or password.";
    case "USER_DISABLED": return "This account is disabled.";
    case "TOO_MANY_ATTEMPTS_TRY_LATER": return "Too many attempts. Try again in a few minutes.";
    case "INVALID_EMAIL": return "Enter a valid email address.";
    default: return "Sign-in failed. Try again.";
  }
}

export async function signIn(email: string, password: string): Promise<{ email: string }> {
  let res: Response;
  try {
    res = await fetch(`${SIGN_IN_URL}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch {
    throw new Error(NETWORK_MESSAGE);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.idToken !== "string" || typeof body.refreshToken !== "string") throw new Error(signInMessage(body?.error?.message));
  generation++;
  const session: Session = { email: typeof body.email === "string" ? body.email : email, idToken: body.idToken, refreshToken: body.refreshToken, expiresAt: expiresAt(body.expiresIn) };
  await save(session);
  return { email: session.email };
}

export async function signOut() {
  generation++;
  refreshing = undefined;
  await clear();
}

async function refresh(session: Session): Promise<string | null> {
  const started = generation;
  try {
    const res = await fetch(`${REFRESH_URL}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }).toString(),
    });
    const body = await res.json();
    if (!res.ok || typeof body?.id_token !== "string" || typeof body.refresh_token !== "string") throw new Error("refresh failed");
    if (started !== generation) return null;
    await save({ email: session.email, idToken: body.id_token, refreshToken: body.refresh_token, expiresAt: expiresAt(body.expires_in) });
    return body.id_token;
  } catch {
    if (started === generation) await clear();
    return null;
  }
}

// A valid ID token, refreshed first when it has less than five minutes left; null when signed out.
export async function getIdToken(): Promise<string | null> {
  if (!authRequired()) return null;
  const session = await load();
  if (!session) return null;
  if (session.expiresAt - Date.now() > REFRESH_MARGIN) return session.idToken;
  if (!refreshing) {
    const request = refresh(session).finally(() => { if (refreshing === request) refreshing = undefined; });
    refreshing = request;
  }
  return refreshing;
}

export async function currentUser(): Promise<{ email: string } | null> {
  if (!(await getIdToken())) return null;
  const session = await load();
  return session ? { email: session.email } : null;
}

// The voice WebSocket can't send headers: offer the ID token as a subprotocol the server reads
// (and never echoes), so it stays out of URLs and logs. Empty when sign-in is off.
export async function wsProtocols(): Promise<string[]> {
  if (!authRequired()) return [];
  const token = await getIdToken();
  return token ? ["guiderail", `guiderail.auth.${token}`] : [];
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function lost(error: AuthError): Promise<never> {
  generation++;
  await clear();
  lostListener?.(error);
  throw error;
}

// fetch with the coach's Bearer token. A rejected token clears the session, tells the panel, and throws AuthError.
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!authRequired()) return fetch(url, init);
  const auth = await authHeaders();
  if (!auth.Authorization) return lost(new AuthError("sign_in_required", EXPIRED_MESSAGE));
  const headers = new Headers(init.headers);
  headers.set("Authorization", auth.Authorization);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) return lost(new AuthError("sign_in_required", EXPIRED_MESSAGE));
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error === "not_allowed") return lost(new AuthError("not_allowed", NOT_ALLOWED_MESSAGE));
  }
  return res;
}
