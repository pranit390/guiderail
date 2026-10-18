import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export type Verified = { uid: string; email?: string; emailVerified: boolean };
export type VerifyToken = (idToken: string) => Promise<Verified>;

type AuthFailure = {
  ok: false;
  status: 401 | 403;
  body: { error: string; message: string };
};

const signInRequired: AuthFailure = {
  ok: false,
  status: 401,
  body: { error: "sign_in_required", message: "Sign in to GuideRail to continue." },
};

const notAllowed: AuthFailure = {
  ok: false,
  status: 403,
  body: { error: "not_allowed", message: "This account isn't allowed to use this GuideRail demo." },
};

const allowedEmails = (env: NodeJS.ProcessEnv) =>
  new Set((env.ALLOWED_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

export function authMode(env = process.env): "required" | "off" | "closed" {
  if (allowedEmails(env).size > 0) return "required";
  return env.K_SERVICE ? "closed" : "off";
}

let initialized = false;
const verifyFirebaseToken: VerifyToken = async (idToken) => {
  if (!initialized) {
    if (!getApps().length) {
      const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
      initializeApp({ projectId });
    }
    initialized = true;
  }
  const decoded = await getAuth().verifyIdToken(idToken, true);
  return { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified === true };
};

let verifier: VerifyToken = verifyFirebaseToken;
export function setTokenVerifier(verify?: VerifyToken) {
  verifier = verify ?? verifyFirebaseToken;
}

export async function authorize(
  header: string | undefined,
  verify: VerifyToken = verifier,
  env = process.env,
): Promise<{ ok: true; uid?: string; email?: string } | AuthFailure> {
  const mode = authMode(env);
  if (mode === "off") return { ok: true };
  if (mode === "closed") return notAllowed;

  const match = header?.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1].trim();
  if (!idToken) return signInRequired;

  let verified: Verified;
  try {
    verified = await verify(idToken);
  } catch {
    return signInRequired;
  }

  if (!verified.emailVerified || !verified.email || !allowedEmails(env).has(verified.email.trim().toLowerCase())) return notAllowed;
  return { ok: true, uid: verified.uid, email: verified.email };
}

// The voice WebSocket can't carry an Authorization header, so the extension offers its ID token
// as a WebSocket subprotocol ("guiderail.auth.<token>"); it never appears in the URL or request logs.
export const WS_PROTOCOL = "guiderail";
export const WS_TOKEN_PREFIX = "guiderail.auth.";
export function tokenFromProtocols(header: string | string[] | undefined): string | undefined {
  const offered = (Array.isArray(header) ? header.join(",") : header ?? "").split(",").map((p) => p.trim());
  return offered.find((p) => p.startsWith(WS_TOKEN_PREFIX))?.slice(WS_TOKEN_PREFIX.length) || undefined;
}
