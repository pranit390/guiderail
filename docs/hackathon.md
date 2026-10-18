# AI Builder Cup 2026: submission facts

Source: Hack2skill event dashboard (read 2026-10-15).

## Deadlines (IST)

- Team formation closes **16 Oct 2026, 23:59**. Teams need **at least 2 members**.
- Prototype submission closes **18 Oct 2026, 23:59**. Our internal target is **22:00**.

## Track

**Future of Work & Enterprise Productivity.** Build an AI solution that changes how people and organisations access knowledge, collaborate, make decisions and get everyday work done.
Suggested directions include AI copilots, workflow automation and enterprise knowledge assistants.
Suggested tech: Gemini on Vertex AI, Vertex AI Search, Document AI, Agent Engine + ADK, Cloud Run, BigQuery, AlloyDB or Firestore.

## Mandatory submission items

| Item | Rule |
|---|---|
| Pitch deck | **Must use the prescribed template** (download link on the submission page). Other formats risk disqualification. PDF, up to 5 MB. |
| Demo video | **3–4 minutes**, must clearly show working functionality. Longer videos may be penalised. |
| Deployed prototype | A working link on GCP / Cloud Run that **stays up during evaluation**. No retries if it's down. |
| GitHub repo | **Public**, with source and supporting materials. |
| Description | Up to 1024 characters. Must say how we use **Firebase, Firestore, Cloud Run and Gemini**. |

## Our checklist

- [ ] Team of 2 registered (Zap) before 16 Oct 23:59
- [ ] Cloud Run min instances = 0 (cold starts aren't penalised; see below)
- [ ] Judge sandbox works with no login and no GCP account
- [ ] Repo switched to public, after a secret scan
- [ ] Video recorded by 18 Oct 18:00
- [ ] Deck on the template, exported to PDF under 5 MB
- [ ] Description names all four required services
- [ ] Judge instructions: sample prompts that work, exact steps, and our usage limits stated plainly
- [ ] No company project IDs, service accounts, deploy commands or env vars in the repo or submission

## Ask the Expert session (13 Oct 2026)

Source: the Hack2skill "Ask the expert" session recording (53 min), answered by a Google Cloud Developer Advocate with the Hack2skill host. Timestamps refer to that recording, which is in the participant dashboard's interaction section.

### Rules

- **Mandatory items:** missing any one disqualifies the entry (04:31). Items: pitch deck, a demo video of **3–4 minutes**, a deployed prototype link, an accessible GitHub repo, and a description of how we use **Firebase, Firestore, Cloud Run and Gemini**.
- **The deployed app must keep working through the evaluation period** (05:01). If its APIs, integrations or deployment are down while judges evaluate, the entry is disqualified.
- **Judges open the deployed link themselves,** on any day of the judging period, in no announced order (40:45). The video alone is not enough.
- **The link judges click must be a Cloud Run or Firebase Hosting URL** (08:14, 24:42, 25:35). Avoid a custom domain, because judges can't verify where it is hosted; use the `run.app` or `web.app` address. Other parts may run elsewhere, but the app they click must be on Cloud Run or Firebase.
- **Gemini must be used** (20:10, 47:30). Other models can be added, but not instead of Gemini.
- **Any exposed secret means disqualification** (27:15). Don't show deploy commands, environment variables, credentials or identifiers anywhere in the repo, deck, video or description. Keep secrets in Secret Manager or environment variables.
- **Team members must be professionals, not students** (06:00). Profiles are checked. At most two members travel; visas are our responsibility.
- **The 18 Oct deadline will not be extended** (52:34).

### Guidance

- **Keep it live until results** (11:03). Scale to zero (min instances 0) is recommended. Cold starts aren't penalised; we can raise capacity on a known evaluation day (22:46, 23:49).
- **State the limits** (28:15). Explaining what judges can and can't do (e.g. "no more than five questions") does **not** count against us and helps them.
- **Give judges a test script** (17:02, 26:15, 39:25): sample prompts that are known to work, exact steps and any test login. Keep the prompts simple.
- **Avoid a sign-in wall** unless security is the point of the product (34:31). Clearly labelled synthetic data is fine (36:06).
- **Redeploying is allowed** on the same endpoint (11:03). After the deadline, push only critical fixes that add no features, and avoid risky redeploys during judging (41:40).
- **Repo:** we can keep sensitive core code out and describe it in the README instead (08:44). It must still prove the solution is technically sound.
- **Gemini SDKs:** calling Gemini through the Gen AI SDK is fine, and ADK is not scored (13:05, 14:04). Vertex AI is now called *Gemini Enterprise Agent Platform*.
- **Grounding:** explain where our data comes from and what guardrails we use (15:00, 15:53). Judges will check the repo for it.
- **Latency:** if we kept responses fast, say how, with real numbers (18:02, 23:49). It's judged as technical depth, so don't overclaim.
- **Gemini Live switching languages:** set the language in config and add a guardrail in the prompt (22:06).
- **Gemini 503 errors in a live demo:** keep a tab open where it already worked (39:25).

### What loses points

- **Not answering the problem statement** (32:35).
- **Poor presentation, especially quiet or unclear audio** (32:35). Many entries in a previous event lost points this way. Clarity beats a slightly better idea that is hard to follow.
- **The video and the deployed app don't match** (29:45). AI-assisted editing is fine if it shows the real app.
- **Feasibility doubts** (36:25): will this work in the real world?
- **Too basic** (36:25): an idea that stops at a minimal prototype.
- **Strengths not visible to the judge** (36:25): make the case from the judge's point of view.

### Video advice

- Cover the use case, the tech choices, sample inputs, the app's real response and the impact (31:25).
- The speaker's personal suggestion (38:25): open with the live product, ask a question, walk through the architecture while it answers, then show the result.

Support: support+aibuildercup@hack2skill.com
