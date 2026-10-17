# Teach mode: experts teach GuideRail, new hires are guided by it

Status: draft for review (2026-10-17). Decisions marked **default** are the recommendations from the discussion and are not yet confirmed.

## Why

GuideRail guided a user to a Labels field that doesn't exist: the real Cloud Run create form has no Labels field (labels are added afterwards on the Services list, Info panel → Labels tab). Our knowledge came from our own assumptions. Knowledge must come from **the real, current UI as an expert actually uses it**, plus the expert's reasons.

Pitch extension: **Your experts teach it once. Every new hire is guided by it, and guarded by your rules.**

## Modes

- **Teach mode** (expert): the expert performs a real task in any Google web tool. GuideRail records what they do, listens to what they say, and occasionally asks "why?" at key choices. It never guides or acts in this mode.
- **Guide mode** (new hire, existing behaviour): GuideRail coaches through the task using published Playbooks and Rules.

Name: **Teach mode / Guide mode** (default).

## What a Teach session records

| Event | Fields | Notes |
|---|---|---|
| `click` | at, url, title, target {role, name, section} | Element described by meaning, never coordinates or CSS selectors |
| `navigate` | at, url, title | Includes moves to another tab or app (e.g. Gmail) in the same window |
| `field` | at, url, target, value | On `change`, not every keystroke. Password fields are never read. Values that look like secrets are masked |
| `narration` | at, text | The expert's speech, transcribed |
| `answer` | at, question, text | The expert's reply to a "why?" question |

Recording limits: max 500 events per session; consecutive `field` events on the same target keep only the last value.

## From recording to knowledge

1. Expert clicks **Stop**. The session (goal + events) goes to the server.
2. The server asks Gemini (`gemini-3.8-flash`, JSON response) for a **Playbook draft**: title, `appliesTo` URL globs, `goals`, a markdown body (steps, where things are, conventions with reasons, quirks), and **suggested Rules** in the existing Rule JSON format, restricted to label and field checks.
3. The expert reviews the draft in the side panel and clicks **Publish**. They can untick suggested Rules before publishing.
4. Published Playbooks go into every new Guide-mode Live session's instructions. Published Rules join the Rule set the extension checks.

Approval: the expert publishes directly (default); admin review is out of scope.
Narration: strongly encouraged, not required (default). The teach-mode model asks at most one "why?" per three steps.
Rules from Teach mode are **suggestions the expert confirms** (default). Checks stay deterministic (ADR 0002).

## Storage

Local first: published Playbooks and Rules are JSON/markdown files under `data/` (gitignored), behind `PlaybookStore` and `RuleStore` interfaces so Firestore can replace them for the submission. Seed Playbooks and Rules remain read-only defaults.

## Privacy

- Never read `input[type=password]` or `autocomplete*=password` fields (existing `isSecret`).
- Mask values that look like secrets: 24+ chars of base64/hex, `sk-…`, `AIza…`, JWTs (`xxx.yyy.zzz`), PEM blocks.
- Visible recording indicator in the side panel and a small "Recording" badge in the page overlay.
- Events from GuideRail's own overlay and side panel are never recorded.

## Demo impact

Add **Act 0** (about 40 s): an expert teaches "deploy to Cloud Run the way we do it", including labels on the Services list and the reason for `us-central1`. Then the existing story, with the new hire guided by what was taught. The sandbox must match the real console: no Labels field on the create form; a Services list page with an Info panel Labels tab.

## Out of scope

Editing Playbooks step by step, version history, admin approval queue, team sharing, screenshots or video capture, auto-detecting branches across multiple recordings.
