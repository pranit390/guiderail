#!/usr/bin/env bash
# Creates GuideRail's labels, day milestones and task issues on GitHub.
# Needs a token with Issues: Read and write. Safe to re-run for labels; issues are created each run.
set -euo pipefail
R="${REPO:-pranit390/guiderail}"

label() { gh label create "$1" -R "$R" --color "$2" --description "$3" --force >/dev/null; }
label submission b60205 "Required for the hackathon submission"
label pitch      fbca04 "Deck, video, description"
label extension  1d76db "Chrome extension and overlay"
label api        5319e7 "Cloud Run API and Live relay"
label policy     0e8a16 "Policy engine and Rules"
label infra      c5def5 "GCP, Firebase, deploy"
label decision   d4c5f9 "Needs a decision"

milestone() {
  gh api "repos/$R/milestones" --jq .title -f title="$1" -f due_on="$2T18:29:00Z" 2>/dev/null \
    || echo "milestone exists: $1"
}
D1="Day 1 · 16 Oct"; D2="Day 2 · 17 Oct"; D3="Day 3 · 18 Oct (submit)"
milestone "$D1" 2026-10-16
milestone "$D2" 2026-10-17
milestone "$D3" 2026-10-18

issue() { # title, labels, milestone, body
  gh issue create -R "$R" --title "$1" --label "$2" --milestone "$3" --body "$4" >/dev/null
  echo "created: $1"
}

# ---------- Submission ----------
issue "Confirm team of 2 is registered before 16 Oct 23:59 IST" "submission" "$D1" \
"Teams need at least 2 members to submit. Team formation closes **16 Oct 2026, 23:59 IST**.
- [ ] Team (Zap) shows 2 members on the Hack2skill dashboard
- [ ] Both members registered under it"

issue "Pitch deck on the official template" "submission,pitch" "$D3" \
"The deck **must** use the prescribed template (download link on the submission page), or the submission may be disqualified. PDF, up to 5 MB.
- [ ] Download the template
- [ ] Day 1: story slides from \`docs/pitch.md\` (problem, guide first / guard second, how it works, Google stack, market, competitors)
- [ ] Day 2: architecture slide and demo-flow slide from \`docs/blueprint.html\`
- [ ] Day 3: real screenshots/GIFs and numbers, export PDF under 5 MB
- [ ] Every slide names the Google services it uses (an AI evaluator likely reads it)"

issue "Demo video, 3–4 minutes" "submission,pitch" "$D3" \
"Must clearly show working functionality. Over 4 minutes may be penalised.
- [ ] Script from the 9-beat story in \`docs/pitch.md\`
- [ ] Two Chrome profiles: Requester and Approver
- [ ] Record a full run by **18 Oct 18:00 IST**, plus a backup take
- [ ] Say the \"no login needed\" line for judges
- [ ] Upload and check the link is public"

issue "Submission description (1024 chars)" "submission,pitch" "$D3" \
"Must say how we use **Firebase, Firestore, Cloud Run and Gemini**.
- [ ] Draft names each service with its concrete use
- [ ] Under 1024 characters"

issue "Deployed prototype that stays up during judging" "submission,infra" "$D3" \
"Judges evaluate the live link. No retries if it's down.
- [ ] Cloud Run \`--min-instances 1\`, \`--timeout 3600\`, session affinity
- [ ] Judge sandbox works with no login and no GCP account
- [ ] Budget alert set
- [ ] Smoke test from a fresh incognito window"

issue "Make the repo public safely" "submission" "$D3" \
"- [ ] Secret scan of the full history (no keys, tokens, service-account JSON)
- [ ] No company-specific names or internal data
- [ ] LICENSE added
- [ ] README has judge instructions and the extension download
- [ ] Switch visibility to public"

issue "Submit the form by 22:00 IST, 18 Oct" "submission" "$D3" \
"Internal deadline 22:00, two hours before the official close.
- [ ] Challenge: Future of Work & Enterprise Productivity
- [ ] Prototype link
- [ ] Deck PDF
- [ ] Public GitHub link
- [ ] Video link
- [ ] Description"

# ---------- Build ----------
issue "Monorepo setup and local emulators" "infra" "$D1" \
"Workspaces: \`extension/\`, \`overlay/\`, \`policy-engine/\`, \`api/\`, \`web/\`.
- [ ] TypeScript workspace, shared tsconfig, lint
- [ ] Java 21 installed (Firestore and Auth emulators)
- [ ] \`firebase-tools\` as a dev dependency, emulator config, demo project ID
- [ ] Seed script loads \`seed/\` into the Firestore emulator
- [ ] ADC set up for local Vertex calls"

issue "Policy engine: guide + check against seed Rules" "policy" "$D1" \
"Pure TypeScript, no model calls (ADR 0002).
- [ ] Rule schema (zod) for \`seed/rules/org-labeling-rules.json\`
- [ ] Check kinds: label_required, label_value_enum, label_value_regex, label_all_regex, field_value_not_in, element_interaction, llm_judge (stub)
- [ ] \`guidanceFor(section, context)\` returns explain/format/examples/suggested values
- [ ] Violation diffing so only new Violations are reported
- [ ] Unit tests for every seed Rule"

issue "Sandbox pages: Cloud Run create, IAM grant, Gmail compose" "extension" "$D1" \
"Realistic local copies used for development and by judges.
- [ ] Cloud Run create form with collapsed Labels section and row-by-row label editor
- [ ] IAM grant access page with role picker
- [ ] Gmail-style compose page that reads the compose URL parameters
- [ ] Load the overlay bundle with a script tag (embed mode)"

issue "Extension skeleton: side panel, page reader, element finder, overlay" "extension" "$D1" \
"- [ ] MV3 manifest, Cmd+Shift+K hotkey, side panel
- [ ] Welcome tab grants microphone permission once
- [ ] Page reader: interactive elements with role, name, value; password fields excluded; open shadow roots and frames
- [ ] Element finder: exact, fuzzy, aria-label, nearby label; returns alternatives
- [ ] Overlay in Shadow DOM: pulse highlight, badges, flagged Create
- [ ] **Milestone:** \"where do I add labels?\" pulses the Labels section on the sandbox page"

issue "Live relay: side panel ⇄ Cloud Run ⇄ Vertex Live" "api" "$D1" \
"ADR 0003. Model \`gemini-live-2.5-flash-native-audio\`.
- [ ] WebSocket \`/live\` with Firebase ID token check
- [ ] Audio up (PCM16 16 kHz) and down (24 kHz)
- [ ] Tool calls routed to the side panel; server tools run in the API
- [ ] Session resumption handles and context window compression
- [ ] 10-minute cap and per-user limit"

issue "Step loop, Journey state and resume" "extension" "$D2" \
"- [ ] Tools: read_page, highlight, wait_for_user, complete_step
- [ ] wait_for_user: click, url_change, element_visible, field_value, 45 s nudge
- [ ] Journey saved to Firestore (offline cache) and pointer in chrome.storage.session
- [ ] Survives tab switch, page reload and side panel reopen"

issue "Guide-first Labels step: get_guidance and Suggested labels card" "policy,extension" "$D2" \
"- [ ] On reaching a section with Rules, speak the explanation before the user types
- [ ] Suggested values: owner from first name, managed-by=manual for console, application from service name, component from resource type, environment asked
- [ ] Card with copy buttons; GuideRail never types
- [ ] Form watcher → check_policy → badges, flagged Create, spoken fix for new Violations only"

issue "Blockers and Detours: permission denied → approval → resume" "extension,api" "$D2" \
"- [ ] Detect not_signed_in, permission_denied, needs_approval, api_disabled; unknown via report_blocker
- [ ] lookup_role and create_approval server tools
- [ ] Gmail compose opened by URL with role, project, reason and Approver link (user sends)
- [ ] Approver page starts the Approver Journey with the role chosen; iam-no-owner Rule
- [ ] Requester Journey resumes when the approval is granted"

issue "Admin dashboard" "extension" "$D3" \
"- [ ] Journeys, Steps, Detours, Violations prevented and resolved
- [ ] View and edit Rules in the sandbox org
- [ ] Numbers used in the demo close"

issue "Deploy: APIs, service account, Cloud Run, Firebase, App Check" "infra" "$D2" \
"Only after the local build works.
- [ ] Enable Cloud Run, Firestore, Firebase, IAM APIs
- [ ] Service account with roles/aiplatform.user and roles/datastore.user, **no key**
- [ ] Every resource carries the 5 labels from the Org Labeling Policy
- [ ] Firebase project, Hosting, anonymous Auth, App Check (reCAPTCHA Enterprise)
- [ ] Firestore TTL on sandbox orgs (7 days)"

# ---------- Decisions ----------
issue "Open decisions to confirm" "decision" "$D1" \
"Defaults are in use until confirmed (see blueprint section 0).
- [ ] Q1–Q10 from the grilling round
- [ ] ADR 0003 (Vertex Live via Cloud Run relay) proposed → accepted
- [ ] Name for how-to markdown files: Playbook?
- [ ] Playbook placeholders: region us-central1, service account sa-<app>
- [ ] Commit email spelling"
