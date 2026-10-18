# Extension panel design

## 1. Atmosphere and identity
Preserve the existing compact GuideRail panel and its reusable Journey card.
The goal is readable cited guidance alongside the console, with human clicks.

## 2. Color
Use panel.css tokens: bg, surface, ink, muted, line, accent, accent-soft,
bad, warn and ok, including their existing light and dark values.
Green (`--gr-go`, light #0f7a4a / dark #5fe0a8) means Here or reported
progress; amber means Check; red is reserved for a blocking Rule. Each keeps
its existing circle/check, diamond/exclamation or octagon/cross glyph and
solid/dashed line grammar. Bright green is a halo on Google's light surfaces.
The actionable Journey Next button uses go/on-go fill and text, with 600 weight;
disabled uses surface-2/muted and the existing disabled opacity.

## 3. Typography
System sans-serif body 14px/1.5; card headings 13px uppercase; status and
citation chips 12px. Existing monospace appears only for values.

## 4. Spacing and layout
Keep the existing 4/6/8/10/12px spacing vocabulary. One region, #scroll, owns
scrolling: current Step, log and cards scroll together, and new log messages
follow the latest. The current Step stays outside the log. Header
and composer stay pinned outside #scroll. Journey rows wrap within the card.

## 5. Components
Reuse card, button, details and ordered Step rows. Citation chips are ordinary
source links with an accessible heading, ink text, line border and 6px radius.
Step controls: Read and point, Re-read, Skip explicitly, and Next step.
The current heading names the cited Step being pointed to, with its Journey
index and total (distinct from the console wizard's own three sections). A
pointed control moves guidance only when it uniquely equals a Step control or
ends with it as a whole phrase, never by fuzzy match and never onto Create;
earlier Steps remain unreviewed. Only the person's Next, Skip or click on the
pointed control records progress. Duplicate Next
names never choose a Step by guesswork; Create never enables Next.
Next spans the card width with a 36px minimum height. Skip stays secondary.
Model replies and Playbook drafts share safe bold/italic/code and list
rendering. Unknown Markdown and HTML remain literal text; no HTML or links are
interpreted. Streaming reparses the current reply so split emphasis works.
One amber, 12px working line sits outside the chat live region. It names the
pending tool; aria-busy covers chat while it runs and clears on every exit.
Page telemetry remains model/session context, without repeated chat rows.
Page changes, Teach entry and draft review clear stale suggestion/Rule cards
and discard form reads begun before them;
in Guide, page changes then re-check Rules against the current form.
Journey citations and mismatch messages retain their separate owner.
Status is live text: unverified, visible, missing, ambiguous, skipped or paused.
No inferred completion. Disabled controls retain their names. All controls are
native keyboard-operable elements with the existing focus-visible treatment.

## 6. Motion and interaction
No new animation. Pending operations disable duplicate starts. Missing controls
retain their citations and offer re-read or explicit skip. Re-read never clicks
or fills the console. Creating a resource is always the person's action.
Retain the existing three 2400ms opacity breaths on the Here halo; Calmer and
prefers-reduced-motion keep it static. Next hover/press changes brightness
in place, with no positional motion. The beui animated-badge reference's
reduced-motion rule (state lands at rest) is the interaction reference.

## 7. Depth and surface
Existing 1px line borders, surface backgrounds, 8px card and 6px control radii.
No new shadows or decorative layers.
Page overlays are the functional exception: one pointer-transparent dimmer
uses a 100vmax black shadow at .12 alpha with a 6px blur around one cutout.
The cutout follows only the current semantic control, padded 8px, including a
radio/checkbox's label or role container. The ring uses 4px padding and the
surface corner radius (minimum 4px) plus padding. A single geometry owner
measures both, including scroll, resize and layout changes.
The existing dark Here tag retains its 11px type, 4px/7px padding and 260px
maximum width. Placement measures text line boxes and interactive surfaces,
including open shadow roots: right, left, above, below; 12px target gap, 4px
content clearance, 8px viewport margin. Hide when no empty candidate fits.
The ring and calm cutout track the target every frame. The tag is shown only
where a fresh collision scan verified free space: any page mutation, scroll,
resize, font load or target move hides it at once, and it is re-placed from a
new full scan after 200ms without further changes. During continuous page
churn it stays hidden rather than blinking. Full page scans run at most once
per 200ms quiet period.

## 8. Accessibility constraints and scope
Journey status uses its own status region; completed replies use a separate status region so transcript fragments stay quiet. Current Step uses aria-current=step. Keep source
headings and prerequisites visible and preserve focus while status updates.
This task extends the existing component vocabulary; global panel redesign and
its separate acceptance backlog remain outside this Journey slice.
