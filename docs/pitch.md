# GuideRail pitch

## One-liner

**GuideRail guides first and guards second.** It teaches employees any Google tool by voice, one highlighted step at a time. It explains your company's rules before you fill in the form, and catches what's still wrong before you click Create. It never clicks for you.

## Positioning

| | Tour tools (WalkMe, Whatfix, SupaMaus) | Computer-use agents (Claude, Sovy, TipTour autopilot) | **GuideRail** |
|---|---|---|---|
| Who acts | User | AI | **User** |
| Knows *your* company's rules | No | No | **Yes: Policy → Rules** |
| Checks inputs before submit | No | No | **Yes** |
| Handles blockers across apps | No | Partly | **Yes: Detours across Console, IAM, Gmail** |
| Acceptable in production | Yes | Rarely | **Yes, and every step is audited** |

## Who buys it

- **Users:** engineers, analysts and ops staff working in cloud consoles and admin tools
- **Buyers:** platform engineering, cloud governance and FinOps, IT enablement
- **First Policy:** an example Org Labeling Policy (5 mandatory labels)

## Demo story (about 3.5 min, 4 apps, 2 people)

1. **Hook:** a new engineer's first Cloud Run deploy, with docs in one tab and Slack in another, and still the wrong region and no labels.
2. **Sign in:** the Goal is spoken, the `not_signed_in` Blocker is detected and GuideRail points at Sign in.
3. **Guided Steps:** project picker, then Cloud Run, then Create service, each one spoken and highlighted.
4. **Blocker:** permission denied. GuideRail finds `roles/run.developer` and drafts the Gmail request. The user sends it.
5. **Approver:** the admin opens the link and picks *Owner*. GuideRail says "Least privilege: grant Cloud Run Developer." Fixed.
6. **Resume:** "Access granted. Picking up where we left off."
7. **Guide, then guard:** at Labels, GuideRail explains the 5 labels and suggests values. The user types `owner=pranit@example.com`, and GuideRail says "No @ or dots. Use owner=pranit."
8. **Done:** the user clicks Create. The dashboard shows 1 Journey, 4 apps, 4 Violations prevented, about 6 min.
9. **Close:** "Guide first. Guard second. Never clicks for you."

## Impact claims (targets)

- Onboarding to a new tool: days down to minutes
- Fewer "how do I…" tickets to platform teams
- Policy Violations caught before the resource exists, not in a later audit

## Business model

Per-seat pricing. Rolled out by IT through Chrome Enterprise. Policy packs (GCP labels, security baselines, cost controls) are shareable.

## Deck plan

- **Day 1:** fill the hackathon template with the story, problem, solution, stack, market and competitors
- **Day 2:** architecture and demo-flow slides
- **Day 3, by 18:00:** real screenshots, numbers, PDF export
- Every slide names the Google services it uses (an AI evaluator likely reads the deck)
