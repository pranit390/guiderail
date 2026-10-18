# Extension panel design

## 1. Atmosphere and identity
Preserve the existing compact GuideRail panel and its reusable Journey card.
The goal is readable cited guidance alongside the console, with human clicks.

## 2. Color
Use panel.css tokens: bg, surface, ink, muted, line, accent, accent-soft,
bad, warn and ok, including their existing light and dark values.

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
Status is live text: unverified, visible, missing, ambiguous, skipped or paused.
No inferred completion. Disabled controls retain their names. All controls are
native keyboard-operable elements with the existing focus-visible treatment.

## 6. Motion and interaction
No new animation. Pending operations disable duplicate starts. Missing controls
retain their citations and offer re-read or explicit skip. Re-read never clicks
or fills the console. Creating a resource is always the person's action.

## 7. Depth and surface
Existing 1px line borders, surface backgrounds, 8px card and 6px control radii.
No new shadows or decorative layers.

## 8. Accessibility constraints and scope
Journey status uses its own status region; completed replies use a separate status region so transcript fragments stay quiet. Current Step uses aria-current=step. Keep source
headings and prerequisites visible and preserve focus while status updates.
This task extends the existing component vocabulary; global panel redesign and
its separate acceptance backlog remain outside this Journey slice.
