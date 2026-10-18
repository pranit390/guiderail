# GuideRail

**Your experts teach it once. Every new hire is guided by it, and guarded by your rules.**
Guide first. Guard second. The rail you hold onto in any Google tool.

GuideRail is a voice coach for Google tools. It guides employees through a task by voice, highlighting each step on the live page in Cloud Console, IAM and Gmail. It explains company policy before the user fills in a form, and catches anything still wrong before they click Create. It never clicks for the user.

Built for the Hack2skill **AI Builder Cup 2026**, track *Future of Work & Enterprise Productivity*.

## The problem

- Enterprise tools change every month, and the docs don't match the screen.
- Real tasks get **blocked**: missing permissions, approvals, service accounts. Docs and tours stop working at that point.
- Policy mistakes such as a wrong region, missing labels or Owner granted to everyone are found later in an audit, when they are expensive to fix.
- Today's tools solve only part of this. Tour tools show *where* to click, not whether the input is *allowed*. AI agents click *for* you, which security teams won't allow in production.

## What GuideRail does

0. **Learns from your experts (Teach mode):** an expert does the task once in the real tool and says why. GuideRail records the steps by meaning (never passwords or screenshots), asks "why?" at key choices, and drafts a Playbook and suggested Rules for the expert to publish.
1. **Guides:** you say the Goal ("deploy my app to Cloud Run"). GuideRail speaks each Step and highlights the exact button or field.
2. **Explains policy up front:** at a form section with Rules, it explains what's required and suggests values, e.g. `owner=pranit`, `managed-by=manual`.
3. **Guards:** it checks every field change against company Rules and flags Create until the form is compliant.
4. **Clears blockers:** on *permission denied* it finds the least-privilege role, drafts the request in Gmail (you click Send) and guides the Approver through IAM. Then it picks up where you left off.
5. **Never acts for you:** there is no click, type or send tool.

## Spoken replies and guiding colours

Use **Voice on / Voice off** beside the input (or **Alt+Shift+V**) to toggle spoken replies. Voice is on by default and your choice survives panel reloads. Turning it off fades current playback; chat captions keep arriving and microphone input remains independent. Turning it back on during a reply takes effect on the next reply.

Green means Here / Done, yellow means Check / Suggested / Recording, and red marks only blocking Rule Violations. Shapes, line patterns and labels carry the same meaning without colour. Reduced motion keeps these states static. See [the design contract](DESIGN.md) for tokens and motion.

## Google stack

| Need | Service |
|---|---|
| Voice and tool calling | Gemini Live on **Vertex AI** (`gemini-live-2.5-flash-native-audio`) |
| Policy compile and fuzzy checks | **Gemini** on Vertex AI (`gemini-3.8-flash`), **ADK** |
| API and Live relay | **Cloud Run** |
| Policies, Rules, Journeys, audit | **Firestore** (with offline cache in the browser) |
| Sign-in, hosting, abuse protection | **Firebase** Auth (anonymous + Google), Hosting, App Check |
| Client | Chrome extension (MV3), with org-wide rollout through Chrome Enterprise |

## Repo map

| Path | What |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Glossary: Goal, Journey, Detour, Step, Policy, Rule, Violation… |
| [`docs/blueprint.html`](docs/blueprint.html) | Architecture, extension flow, server flow, tools, data, 3-day plan ([live version](https://claude.ai/artifact/PFmBmRGUUKoxbfkyPWYb2S)) |
| [`docs/pitch.md`](docs/pitch.md) | Pitch, demo story, business model |
| [`docs/adr/`](docs/adr) | Decision records |
| [`docs/research/`](docs/research) | Competitor teardown (SupaMaus, TipTour) and alternatives we rejected |
| [`docs/hackathon.md`](docs/hackathon.md) | Submission rules and deadlines |
| [`seed/`](seed) | Seed Policy, Rules and Playbook for the demo org |

## For judges

**No login required.** Open the demo link and press **Start guided demo**. You're signed in automatically with a private sandbox. Click **Admin view** to edit the Policy in your own sandbox.
