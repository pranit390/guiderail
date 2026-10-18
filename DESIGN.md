# GuideRail guiding states

The authorized creative report (18 October 2026) is the visual contract. Preserve the existing panel layout and exact-field overlay targeting. This slice introduces no framework or motion dependency.

## Tokens and contrast

Light: background #f4f7f5, surface #ffffff, secondary #eef2ef, separator #dde4df, control #7d8a83, ink #16211c, muted #56635c. Go #0f7a4a / tint #e3f6ec; Check #7a5c00 / tint #fff6d6; Stop #c5221f / tint #fde8e6. Dark: background #0d1110, surface #141a18, secondary #1a2220, separator #2a3530, control #5d6f66, ink #e9efe9, muted #9aa79f. Go #5fe0a8 / tint #133528; Check #ffd23f / tint #3a3212; Stop #ff7a70 / tint #3a1a17. Bright green is a decorative halo on light pages. Light state ink exceeds 4.5:1 on white, Google grey #f1f3f4 and selection blue #e8f0fe. Page cues sample their own surroundings; controls never receive an opaque overlay fill.

## Typography and geometry

Retain system UI at 14px/1.5, 16px brand, 12px secondary copy, 13px cards and 11px page chips. Retain existing panel scroll ownership; shared scrolling belongs to https://github.com/pranit390/guiderail/pull/47. The compact current Journey Step sits outside the conversation log so its controls stay reachable; the full cited template is a disclosure. Page outlines sit outside fields; chips use existing collision detection. Neutral chat surfaces keep colour meaningful.

## Primitives and states

Go: circle enclosing a tick, solid edge, Here / Done / Ready. Check: diamond enclosing !, dashed edge, Check / Suggested / Recording / connection retry. Stop: octagon enclosing ×, solid edge and faint outer tint ring, Rule label and deterministic Rule message. Only block-severity Violations use Stop. A mixed field uses Stop if any Rule blocks, otherwise Check. Recording, Teach, proposals and connection failures use Check; live microphone uses Go. Glyphs and words remain meaningful without hue.

## Motion and interaction

Use opacity and transform only. Go halo breathes three times at 2400ms then rests at 35%; Check attention pulses twice at 1400ms. Stop settles once at 320ms with cubic-bezier(.3,1.35,.5,1). Step completion arrives once at 320ms and remains readable. Button state changes are immediate so muting never waits for a visual transition. Reduced motion and calmer mode show static end states. Forced colours remove halos and retain glyphs, line patterns and labels.

Spoken replies is a native aria-pressed button beside the composer, default on, saved as chrome.storage.local voiceOut. Alt+Shift+V toggles the same control. Muting fades current playback for 120ms and discards queued audio, with captions continuing. Re-enabling during a turn waits for the next turn. Microphone input is independent. No Live response modality changes.

## Accessibility and accepted limits

Keyboard focus uses Go with 2px offset. Controls have contrasting borders; state changes have polite announcements. The sibling scroll/reveal controller is not integrated here; state tokens and voice controls are retained. Current Step progression updates the compact summary without moving composer focus. No autonomous form actions or Zen owner are introduced. Real console evidence requires a page available to this isolated browser; do not claim sandbox evidence as live-console proof.
