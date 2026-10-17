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
identity system; deployment must integrate the relay's identity/admission work.
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
ends the briefing, and reads and highlights return to the current page so the
compiled Journey continues there. A Journey cache read failure is logged and
Guide connects with its plain instruction instead.

Tests use a labelled deterministic fixture. Live-provider timing and browser
screenshots must be recorded separately; test success is not provider or
real-console evidence. The 30-second uncached target is a stretch; record actual
time and warm the cache before recording or judging.
