# Firebase sign-in check

The coach requires Firebase sign-in for the cost-bearing `POST /session`, `POST /journeys/compile`, `POST /playbooks/draft`, and `POST /playbooks` routes. All other routes, including `/health`, `/rules`, Playbook reads, `/role`, `/a/:id`, `/sandbox/*`, and `/live`, retain their existing access rules.

## Configuration

- `ALLOWED_EMAILS`: comma-separated allowlist of verified Firebase account emails. Values are trimmed and compared case-insensitively.
- `FIREBASE_PROJECT_ID`: Firebase project ID. If unset, the server uses `GOOGLE_CLOUD_PROJECT`.

When `ALLOWED_EMAILS` is non-empty, Firebase sign-in is required. On Cloud Run (`K_SERVICE` is set), an empty or missing allowlist fails closed and each gated route returns `403`. Outside Cloud Run, an empty or missing allowlist turns the sign-in check off for local development and logs a warning.

Missing, invalid, expired, or revoked ID tokens return `401 {"error":"sign_in_required","message":"Sign in to GuideRail to continue."}`. A valid token with an unverified email or an email outside the allowlist returns `403 {"error":"not_allowed","message":"This account isn't allowed to use this GuideRail demo."}`.

Firebase console setup: enable Email/Password, turn public sign-up off, and turn email enumeration protection on. Create accounts by hand; passwords never go in the repo.

Judges sign in with the demo login provided with the judging packet. Share it only through the submission form's private field / judging packet, never in the deck.
