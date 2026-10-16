# Competitor and prior-art teardown

Researched 2026-10-15/16.

## SupaMaus (supamaus.com): browser AI cursor

- Chrome extension (MV3, v5.65.0, from public release builds in `milind-soni/supamaus-releases`; source is private) plus an embed script for SaaS vendors.
- **Voice:** Gemini Live (`gemini-3.1-flash-live-preview`, Developer API). The browser connects directly over WebSocket with a short-lived token from their backend.
- **Backend:** Convex (not Google).
- **Agent tools:** `search_workflows`, `run_workflow`, `read_page_context`, `read_page_elements`, `search_page_text`, `highlight_element`, `point_at_coordinates`, `modify_workflow`, `compose_workflow`, `search_internal_docs`, `search_external_help`, and autopilot-only `fill_text`, `select_option`, `set_checked`.
- Permissions: `debugger` and `cookies` on all sites.
- Paid, with pricing on a sales call.
- **Gap:** it guides and fills fields, but nothing in its code **checks inputs against company policy**.

## TipTour (`milind-soni/tiptour-macos`, MIT, Swift)

- macOS menu-bar companion. Gemini voice mode (`gemini-3.1-flash-live-preview`) plus a text "JEV" click loop.
- **Key pattern:** Gemini's single tool `submit_workflow_plan` returns one step with the **literal visible text** of the target. A local resolver (accessibility tree, OCR, CoreML) finds the coordinates. The model never outputs pixels. We copy this.
- "Point only" vs "Auto-click" modes. "Learn from a video" (via Elorian, not Google) builds tours that wait for the user to act.
- Per-app markdown "skills" hold app quirks.

## Sovy AI (sovyai.tech)

- Windows desktop agent that **does tasks for you** (push-to-talk, then it clicks). The opposite of a coach.

## Pi Durable (earendil.com/posts/pi-durable): rejected for the MVP

- Durable agent runtime (checkpointed tasks, resume after crash; SQLite, JSONL or memory storage). Experimental API.
- Rejected because it has no browser storage adapter (we'd have to build SQLite WASM + OPFS + offscreen worker), it doesn't run the Gemini Live audio loop, it would replace ADK, and it's outside the Google ecosystem.
- Replaced by Live API session resumption + `chrome.storage.session` + the Firestore offline cache.

## What this means for us

Voice guidance on any site is already covered (SupaMaus, TipTour). **Explaining and enforcing company Rules before submit, across Blockers and apps,** is not. That's GuideRail's position: guide first, guard second.
