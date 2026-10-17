# GuideRail pitch

## One-liner

**Your experts teach it once. Every new hire is guided by it, and guarded by your rules.**

GuideRail guides first and guards second. It coaches employees through any Google tool by voice, one highlighted step at a time. It explains your company's rules before you fill in the form, and catches what's still wrong before you click Create. It never clicks for you.

## Headline feature: Teach mode

**The problem it solves:** docs drift, tools change every month, and the real way your team does a task lives in a few experts' heads. Even our own first version guessed wrong: it sent users looking for a Labels field on Cloud Run's create form, which doesn't have one. Labels are added afterwards, on the Services list.

**How it works:**

1. **The expert presses Teach** and does the task normally in the real tool (Cloud Console, IAM, Gmail, any Google web app).
2. **GuideRail watches and listens.** It records each step by *meaning* ("clicked the Labels tab in the Info panel"), never screenshots or passwords, and masks anything that looks like a secret.
3. **It asks "why?"** at the choices that matter: "Why us-central1?" "Always, unless it's an EU customer." The *reason* is what docs and recordings usually lose.
4. **Gemini drafts a Playbook** (steps, where things are, conventions with reasons, quirks) and **suggests Rules** ("you set these 5 labels every time; make them required?").
5. **The expert reviews and publishes.** From the next session, every new hire is guided by it, and the confirmed Rules guard their forms.

**Why it matters:**

- Knowledge comes from **the real, current UI**, not from docs or guesses.
- It captures the **why**, so GuideRail can explain conventions instead of just repeating clicks.
- Onboarding scales with **one expert run**, not weeks of shadowing or hand-written tours.
- Rules stay **deterministic and confirmed by a person**: the model suggests, the expert decides.

**Google services in Teach mode:** Gemini Live on Vertex AI (listens, asks why), Gemini on Vertex AI (drafts the Playbook and suggested Rules as JSON), Cloud Run (relay and API), Firestore (published Playbooks and Rules).

## Positioning

| | Tour tools (WalkMe, Whatfix, SupaMaus) | Computer-use agents (Claude, Sovy, TipTour autopilot) | **GuideRail** |
|---|---|---|---|
| Who acts | User | AI | **User** |
| How it learns a task | Someone builds or clicks through a tour | General knowledge | **Your expert does it once and explains why (Teach mode)** |
| Knows *your* company's rules | No | No | **Yes: Policy → Rules, plus Rules suggested from Teach sessions** |
| Checks inputs before submit | No | No | **Yes** |
| Handles blockers across apps | No | Partly | **Yes: Detours across Console, IAM, Gmail** |
| Acceptable in production | Yes | Rarely | **Yes, and every step is audited** |

## Who buys it

- **Users:** new hires and anyone working in cloud consoles and admin tools
- **Experts who teach:** senior engineers, platform and ops leads
- **Buyers:** platform engineering, IT enablement and L&D, cloud governance and FinOps
- **First Policy:** an example Org Labeling Policy (5 mandatory labels)

## Demo story (about 3.5–4 min)

0. **Teach (40 s):** an expert types "Deploy a Cloud Run service our way" and presses **Teach**. They pick `us-central1` and GuideRail asks "Why us-central1?" ("Always, unless it's an EU customer"). They create the service, then add the 5 labels on the Services list. They stop, review the drafted Playbook and suggested Rules, and click **Publish**.
1. **Hook:** a new engineer's first Cloud Run deploy, with docs in one tab and Slack in another.
2. **Guided Steps:** "Deploy my app to Cloud Run." Each step is spoken and highlighted, using the expert's Playbook: "Use us-central1. Your team uses it unless it's an EU customer."
3. **Blocker:** permission denied. GuideRail finds `roles/run.developer` and drafts the Gmail request. The user sends it.
4. **Approver:** the admin opens the link and picks *Owner*. GuideRail says "Least privilege: grant Cloud Run Developer." Fixed.
5. **Resume:** "Access granted. Picking up where we left off."
6. **Guide, then guard:** before Create, GuideRail explains the 5 labels and suggests values, and says they're added on the Services list after creating. On the Services list the user types `owner=pranit@example.com`; GuideRail says "No @ or dots. Use owner=pranit."
7. **Done:** labels saved. The dashboard shows 1 Journey, 4 apps, 4 Violations prevented, about 6 min, guided by 1 expert Playbook.
8. **Close:** "Your experts teach it once. Every new hire is guided, and guarded. GuideRail never clicks for you."

## Impact claims (targets)

- Time to capture a team procedure: **one expert run** instead of writing docs or building tours
- Onboarding to a new tool: days down to minutes
- Fewer "how do I…" tickets to platform teams
- Policy Violations caught before the resource exists, not in a later audit

## Business model

Per-seat pricing for guided users; experts who teach are free. Rolled out by IT through Chrome Enterprise. Playbooks and Policy packs (GCP labels, security baselines, cost controls) are shareable across teams.

## Deck outline (on the hackathon template)

1. **Title:** GuideRail. "Your experts teach it once. Every new hire is guided, and guarded."
2. **Problem:** tools change, docs drift, know-how sits in experts' heads, and policy mistakes are found in audits.
3. **Solution in one picture:** Teach → Guide → Guard.
4. **Highlighted feature: Teach mode.** The expert does the task once and says why; GuideRail records meaning, not pixels; Gemini drafts the Playbook and suggests Rules; the expert publishes. Show the "Why us-central1?" moment and the drafted Playbook.
5. **Guide mode:** voice plus on-screen highlights in the real Google UI, cross-app Detours (permission → Gmail → Approver → resume).
6. **Guard:** guide before guard (explain and suggest), then deterministic checks, the soft block on Create/Save, least privilege for Approvers.
7. **Never clicks for you:** why enterprises accept it in production.
8. **Architecture:** Chrome extension, Cloud Run relay, Gemini Live and Gemini on Vertex AI, Firestore, Firebase. Name what each service does.
9. **Competitors:** the positioning table.
10. **Impact and business model.**
11. **Demo screenshots and links:** prototype, video, GitHub.

Every slide names the Google services it uses (an AI evaluator likely reads the deck).
