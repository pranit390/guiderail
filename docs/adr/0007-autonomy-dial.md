# Autonomy dial

Accepted for the Firestore Journey specification; amends [ADR 0001](0001-coach-never-acts.md).

> GuideRail never takes a consequential action for you, never fills a secret, and never outruns its own guard. Everything else it may do, at the level you choose, showing its plan first, and stopping the moment you say stop.

Guide is the default: explain, cite and point; the person supplies every value
and performs every click. Guide never fills.

Assist is the approved text-assistance level. It asks for Database ID and desired
mode together, previews numbered values and their sources (your answer, Rule or
doc), checks the proposed end state against deterministic Rules, and waits for
explicit approval. For this Journey it may fill only Database ID in an ordinary
text input, then verify readback and rerun Rules. A proposed Test mode blocks
before approval or any fill. Production/Test mode and location stay manual;
custom controls are not supported. The person clicks Create.

Assist never fills secrets, passwords, credentials or file inputs. Missing,
ambiguous, renamed or stale controls stop assistance and return to guidance;
they never imply success. Stop cancels pending assistance immediately, and a
later fill requires a new preview and approval. There are no click, submit,
send, grant, delete or deploy tools. Automatic undo, custom-control filling,
post-submit rollback, per-organization autonomy and Auto are deferred. Guide
and Assist are the only approved levels; Auto must not look available.

This ADR specifies Assist's boundary, not its implementation or acceptance.
Keep public capability claims at Guide until real Assist acceptance passes.
The separate Assist implementation owns the preview, approval, fill, readback
and Stop behavior; this Rule slice does not add an Assist control.

The Firestore Test-mode Rule is company Policy, evaluated by plain code. Its
block Violation marks the exact field in red with a Stop glyph and explains
Production mode as the safe choice. The existing human soft guard holds the
first consequential click and permits the second click within ten seconds;
it is not enforcement against cloud changes. Missing security controls are
unknown, never “all checks passed.” Location guidance links to the vendor's
locations document and explains permanence before Create.

ADRs 0002–0006 remain unchanged. Teach records company know-how into Playbooks;
compiled documentation remains cited vendor guidance. Vendor warnings do not
silently become company Rules, and a Rule firing is not model judgment.
