# Firestore documentation compilation

`POST /journeys/compile` accepts only `{"goalId":"create-firestore-database"}`.
The server selects the Firebase manage-databases HTML/markdown and locations
markdown sources. The response contains `journey` and `cacheHit`. Vendor Steps
are labelled documentation-derived and unverified on the current screen; they
are not company Policy or published Teach Playbooks.

Compilation uses Vertex `gemini-3.8-flash` with URL context, LOW thinking, no SDK
retries and a 90-second deadline. Every cited source must have successful
retrieval metadata from the answer candidate. JSON/schema/retrieval failures
return a readable error, with no fabricated or partial Journey cached. Each
Step names one control, and compound navigation/Next beats are split.

## Warm before serving judges

Run with the same project and cache directory as the relay:

```sh
GOOGLE_CLOUD_PROJECT=your-project JOURNEY_CACHE_DIR=/path/to/journey-cache npm run warm:journeys -w server
```

Run it again to confirm `cacheHit:true` and the elapsed time. The script exits
nonzero on failure, so deployment/rehearsal can stop before exposing a cold
cache. Warmup is explicit, rather than consuming model quota on every server
restart. The default file store is `data/journeys`; change `JOURNEY_CACHE_DIR`
when testing outside the checkout. The key incorporates the catalog Goal,
method, canonical sources and contract version. Increment the version when
changing the source contract. No public cache-bypass or arbitrary-fetch
endpoint exists. Durable/shared storage belongs to the later persistence slice.

The existing write-origin check protects the route. This slice does not add an
identity system. Do not expose the relay publicly until identity/admission
protects both `/journeys/compile` and `/live`; an Origin check is not authentication.
Compilation coalesces concurrent requests and spaces fresh attempts by at least
five seconds within one server process.

## Public documentation briefing

Open the pinned Firebase manage-databases or Google Cloud IAM grant-access page,
then press **Brief me from this page** with Guide connected. Microphone access,
Google sign-in and a cloud project are unnecessary. The extension reads up to
12,000 characters of rendered article text and its visible headings, excluding
hidden content and forms. It highlights only an exact unique rendered heading
on that document; absent or ambiguous sections produce an honest failure.
Typed follow-ups use the existing Live connection. Live receives page text and
validated cached Journey instructions, never search or URL-context tools.
Page tools stay bound to the briefing tab only while it is the active public
doc. Switching tabs or navigating away (for example to the Firebase console)
ends the briefing. Start a console Journey to bind its page tools to a new
Firestore tab; a docs briefing never silently rebinds a console Journey. A Journey cache read failure is logged and
Guide connects with its plain instruction instead.

Tests use a labelled deterministic fixture. Live-provider timing and browser
screenshots must be recorded separately; test success is not provider or
real-console evidence. The 30-second uncached target is a stretch; record actual
time and warm the cache before recording or judging.

## Bound console Journey

Choose **Start Firestore Journey**, or ask Guide to open the Firestore Goal.
`open_page` accepts only `{"goalId":"create-firestore-database"}` and opens the
catalog URL `https://console.firebase.google.com/project/_/firestore/databases`.
It rejects additional URL arguments. Choose the project yourself. The Journey
pins the first concrete Firestore project in that tab. Switching tabs pauses
commands; closed tabs, another project, unsupported pages, and sign-in pages
cannot substitute for it. Use **End Journey binding** to start over.

Cited Steps remain documentation-derived. **Read and point to Step** matches an
exact, unique name in a fresh page read; it does not click or fill the console.
If a control is absent, the Step retains its citation and says "The doc says X.
I can't see it on this screen." Re-read or explicitly skip it. **I did this ·
Next step** records the person's report, not independent verification. After
the person clicks the pointed control, Next stays available while the bound tab
stays on the same project, even if a re-read no longer finds that control.
Another tab, project or unsupported page revokes it. The
final Create action remains human-only and cannot be marked done by the model.
Prerequisite/role guidance stays in the expandable cited warnings section;
existing Blocker/Detour tools handle permission requests without granting access.
Entering Teach ends the binding. Reloading the side panel does not resume it.

See [the real-console probe](firestore-console-probe.md) for observed control
names and the explicit limits of the read-only rehearsal.
