# Cost-limited hosted coach

Issue: https://github.com/pranit390/guiderail/issues/28

The extension requires an explicit build-time origin. There is no implicit local
fallback and no model key in the package:

```sh
GUIDERAIL_SERVER_URL=https://YOUR-COACH-HOST GUIDERAIL_BUILD_REVISION=$(git rev-parse HEAD) npm run build:ext
```

For local development, explicitly use `GUIDERAIL_SERVER_URL=http://localhost:8787`.
The generated manifest grants access to the configured origin and its practice
pages. `extension/dist/build.json` records the origin and source revision. ZIP the
contents of `extension/dist`, extract them, and use Chrome's **Load unpacked**.
The Dockerfile builds and packages those same contents at
`GET /download/guiderail-extension.zip`; the coach's `/` page links the download,
installation steps and practice console. The route returns 404 when the package
has not been built (for example, when running only the local server).
For an image targeting a different coach, set the Docker build argument
`GUIDERAIL_SERVER_URL` to that coach's origin and `GUIDERAIL_BUILD_REVISION` to
the source revision. The default image target is
`https://guiderail-coach-q7tihot5sq-uc.a.run.app`; it must match the runtime
`PUBLIC_ORIGIN` for the hosted service.

The panel does not connect when it opens or when switching between Teach and
Guide. The first typed message or Talk press requests a credential and opens the
Live session; that first message (or up to about 1.5 seconds of speech) is kept
and delivered once the relay is ready. The header status shows a green dot (titled **Connected to GuideRail**)
only after Vertex Live acknowledges setup. Typing works without microphone
permission. When the server can't be reached or the socket closes uncleanly
(for example a mid-session 1006 drop), a server banner keeps unsent text in the
composer and retries after 2, 4, 8, 16 and 30 seconds. Deliberate closes (idle,
session limit, allowance, admission) show the banner without reopening a
session; **Retry connection** reconnects on demand. Only pages in the active
(bound) tab reach the coach. While
disconnected, their page events, recorded Teach steps and app events are kept in
the panel's bounded session memory (at most 200 entries; the next connection gets
a summary under 3,500 characters). A Create click with blocking Violations
reconnects at once so the coach can say the warning; if admission fails or the
daily allowance is used, the panel shows the warning as a prominent alert.

## Runtime and admission

One Cloud Run service, `guiderail-coach`, in `zoop-innovation/us-central1`:
request-based CPU billing, 1 vCPU, 512 MiB, minimum 0, maximum 1, concurrency 10,
timeout 3600 seconds, session affinity, no startup CPU boost. Pin **both** the
service annotation `metadata.annotations.run.googleapis.com/maxScale: '1'`
and revision annotation `spec.template.metadata.annotations.autoscaling.knative.dev/maxScale: '1'`;
the installed older gcloud's `--max-instances=1` sets only the revision limit.
Export the existing service, change only the service annotation, and apply it
with `gcloud run services replace`; verify both levels with a fresh describe.
Attach only
`guiderail-coach@zoop-innovation.iam.gserviceaccount.com`, with the project binding
`roles/aiplatform.user` and, when `STORE=firestore`, `roles/datastore.user`.
No service-account keys are needed.

### Durable Playbooks, Rules and Journey cache

For Pranit's final redeploy, set `STORE=firestore` and
`FIREBASE_PROJECT_ID=zoop-innovation` (or use `GOOGLE_CLOUD_PROJECT` when the
Firebase project variable is unset). Unset `STORE` keeps the existing file
stores for local development and tests; `STORE=file` also selects them.
Cloud Run's writable filesystem is ephemeral, so file mode does not preserve
Teach publications or the compiled cache across instance replacement.

Before that redeploy, create the project's `(default)` Firestore database once
in **Native mode / Standard edition**, selecting its permanent location, and
grant the runtime service account `roles/datastore.user` in that project. The
Admin SDK uses ADC; no credential file is needed. Keep browser Firestore access
denied: this server uses IAM, not client Security Rules. These are operator
steps; this change does not create a database, modify IAM or deploy.
See [Admin SDK setup](https://firebase.google.com/docs/admin/setup) and
[Firestore server IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam).

`playbooks/{id}` contains the validated `playbook` body, `ownerUid`, and an ISO
`updatedAt` timestamp. The UID comes from the verified request;
it is `null` when local sign-in is off. `rules/{playbookId}` holds the selected
runtime Rules with the same metadata and replaces them on republish, including
an empty selection. `journeys/{cacheKey}` holds the validated compiled Journey;
the key hashes the pinned Goal/source/version contract. File seed Playbooks and
Rules remain read-only and are combined with published content in API/Live reads.
The single instance caches the Playbook and Rule collections in memory and
re-reads one only after its next publish, so repeated public reads and Live
session starts do not bill Firestore reads. Stored documents that no longer
validate are skipped with a warning, matching the file stores.

Visibility deliberately stays shared: all published Playbooks and Rules remain
available to all callers, including the existing public read endpoints, and any
authorized publisher can replace the same ID. `ownerUid` records the latest
publisher; it does not add private access control. This persists the compiled
Journey cache portion of issue https://github.com/pranit390/guiderail/issues/33;
private receipts and per-user reload/access control remain separate work.

`DISABLE_DRAFT=true` still prevents both drafting and publishing. To use Teach
on the final service, explicitly enable publishing by setting it to `false`,
retain the sign-in allowlist, and account for model drafting costs separately.
Existing local `data/` files are not automatically migrated to Firestore.

Keep Firestore within its [free quota](https://firebase.google.com/docs/firestore/quotas):
one eligible database per project, 1 GiB stored, 50,000 reads/day,
20,000 writes/day, 20,000 deletes/day, and 10 GiB outbound/month. Verify that
this project's database is eligible and has quota remaining. Do not enable TTL,
PITR or backups for this demo. The existing $20 plan assumes $0 Firestore spend.
Each publish uses two writes and no reads; a cached compile uses one read, and
a new compile adds one write. The Playbook and Rule collections are read once
after each instance start or publish, so watch the Usage tab before and
during judging, including other project traffic. There are no listeners, polling
jobs or per-session Journey writes. Free quota is a usage allowance, not an
application-enforced spending cap; if usage approaches it, stop demo traffic
before continuing. The service does not silently fall back to ephemeral files
when Firestore fails.

Store contracts run with `npm run test -w server -- src/storage.test.ts`.
If `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` is set, those contracts use the real
Admin SDK against the emulator and clear only their dedicated
`demo-guiderail-stores` project's test collections. Otherwise they use an
in-memory fake of the minimal Firestore API; this is not emulator/runtime proof.
The HTTP persistence tests always use that fake and make no model calls.

Set `DISABLE_DRAFT=true` to allow only cached documentation Journeys (an uncached compile returns 503 without calling Gemini), disable the billable Playbook draft endpoint and
Playbook publishing (which would otherwise let anyone change the hosted Guide
instructions and rules), and `DEMO_END_AT=2026-11-07T00:00:00Z` to end new demo
admission after judging (after that time compiles are also cached-only). Set `PUBLIC_ORIGIN` to the deployed bare HTTPS origin
(for example `https://guiderail-coach-q7tihot5sq-uc.a.run.app`, no trailing
slash) to enable same-origin token issuance and Approver links. Extension origins
are also accepted; unrelated browser origins are not. On Cloud Run (`K_SERVICE`
set) without a valid `PUBLIC_ORIGIN`, the `create_approval` tool returns an error
instead of a link; `http://localhost` links are produced only off Cloud Run with
`PUBLIC_ORIGIN` unset. Approval requests are created only by that tool, held in
memory, capped at 100 open requests and 500 characters per field.

The extension obtains a one-use, 60-second credential from `POST /session`.
The server binds it to a fresh session UUID, the signed-in Firebase UID and the issuing Origin, then consumes
it before opening Vertex Live. Missing, expired, replayed or wrong-origin
credentials fail closed. Outstanding credentials are bounded to 128 per instance.
These capabilities supplement Firebase authentication: the hosted coach requires
sign-in with a verified email in `ALLOWED_EMAILS`, and a ticket can only be used
by the same signed-in user. Cloud Run fails closed when the allowlist is absent.

At most three Live sessions run per instance. The fourth receives an explicit
**coach is busy** message. The default shared allowance is 18 aggregate connected Live
minutes per UTC day per instance: three simultaneous clients exhaust it in six
minutes. Only connected time is charged, and the relay disconnects a
session after 120 seconds without activity: typed text, end of speech, page
events, Teach context, app events, transcribed speech or model output. Raw
microphone frames do not count, so an open mic sending silence still times out;
session summaries, tool results and resumption updates do not count either.
The exception is a proposed email: while its confirmation card awaits the user,
the idle timeout is paused (the 20-minute upper limit still applies), and the
`draft_message` result counts as activity. If the session ends anyway, the card
stays open and the user can still open or dismiss the draft locally.
Disconnected clients stop consuming time. Every limit closes the Vertex Live
session immediately and frees the concurrency slot then, before the client's
WebSocket close handshake. Each session also has
a default 20-minute upper limit, no turn or reply-count cap, a 512-output-token limit per response,
24,000 aggregate input text characters (including tool-result JSON, ID and name),
a 4,000-character limit per text/tool-result message (longer text is answered
with an `error` and not delivered; the panel refuses to send it), a 64 KiB WebSocket frame limit, and PCM input paced
to real time with a two-second burst. Context compression targets 4,096 tokens
after an 8,192-token trigger. The shared daily allowance will normally close a
session before the 20-minute upper limit. Reconnect consumes another credential
and the remaining daily allowance; it does not restore minutes in that instance.

The limits are read once at server startup. To override the defaults on the
service at a separately coordinated redeploy, set these exact environment variables:

| Environment variable | Default | Maximum | Meaning |
|---|---:|---:|---|
| `LIVE_DAILY_MINUTES` | 18 | 60 | Aggregate connected Live minutes per UTC day per instance |
| `LIVE_SESSION_MINUTES` | 20 | 30 | Minutes per session, shared by admission and relay |
| `LIVE_IDLE_SECONDS` | 120 | 300 | Seconds without qualifying activity before disconnect |

Positive finite numbers (including fractions) are accepted. Non-positive,
empty or non-numeric values fall back to the default with a startup warning;
values above the maximum are clamped with a warning. Raising the daily allowance
above 18 requires revisiting the $20 cost model below. No service changes or
deployment are part of this source change.

Client tool results are accepted only once for an outstanding model-issued ID
and matching tool name. Forged, mismatched and replayed results are not sent to
Vertex. Oversized frames close only the offending socket, shut down its upstream
and release its admission slot; they do not crash the coach process.

Page reads, form reads and Teach recording share secret-field/value masking,
including API keys, tokens, credentials and one-time codes. Account surfaces
`accounts.google.com`, `myaccount.google.com` and `passwords.google.com` (and
their subdomains) are excluded from reads and event forwarding, even with broad
Google host permission. Names, labels, ordinary visible values and page/Teach
context from other supported pages may leave the browser for the hosted coach
and Vertex; this is heuristic secret masking, not a claim to detect every secret.

## Expected cost commitment through 6 November 2026

This is an **expected spend of USD 19.09 against a $20 commitment under single-instance assumptions**;
it is not a mathematical guarantee. Use a conservative 21 UTC-date allowance
covering 17 October UTC through 6 November: 21 × 18 = 378 aggregate
connected Live minutes. Do not assume Cloud Run's shared billing-account free tier remains
available.

| Component | Planning assumption | Expected USD |
|---|---|---:|
| Live audio | 25 tokens/second in each direction, continuous audio: 1,500 × $3/M + 1,500 × $12/M = $0.0225/min; 378 × $0.0225 | 8.505 |
| Live context/text | Additional reserve equal to base audio for repeated context and transcription/text; 378 × $0.0225 | 8.505 |
| Cloud Run active compute | 378 × 60 = 22,680 s at $0.000024/vCPU-s + 0.5 × $0.0000025/GiB-s = $0.00002525/s; no free-tier discount | 0.57267 |
| Startup, HTTP, network and logs | Small judge traffic, short requests, bounded payloads; reserve | 0.50 |
| Builds and retained task images | Existing builds plus two more redeploys, with images held through judging; reserve | 1.00 |
| **Planning total** | 378 × $0.045 + 22,680 × $0.00002525 + $1.50 = $19.08267, rounded upward | **19.09** |
| **Margin to $20** | $20 − $19.09, after rounding the total upward | **0.91** |

Eighteen minutes is the largest whole-minute daily allowance under this model
with the $1.50 reserve: floor(($20 − $1.50) / (21 × ($0.045 +
60 × $0.00002525))) = 18. Nineteen minutes gives 399 minutes,
399 × $0.045 + 23,940 s × $0.00002525 + $1.50 = $20.059485,
which exceeds the commitment. Compute adds $0.001515 per Live minute
(about $0.0015), for $0.046515 per minute including the $0.045 model allowance.

The 25-token/sec conversion is a planning assumption, not a verified native-audio
upper bound. Vertex bills tokens, including accumulated session context again on
each turn and text transcription. The context reserve assumes short judge
conversations rather than adversarial input. The Cloud Build/image reserve is an
estimate, not a provider-enforced cap.

Residual risks: instance replacement/scale-to-zero/redeployment resets the
in-memory daily counter and capabilities; Cloud Run maximum instances may briefly
be exceeded; public HTTP traffic and repeated startup still incur charges even
when Live admission is closed; context/turn/token usage and network traffic vary.
No project-wide budgets, billing changes or persistent allowance ledger are
created. The optional Firestore setup above is a separate operator step.
Source deployment may create the explicitly authorized
`cloud-run-source-deploy` Artifact Registry repository and its source-build
artifacts. Do not delete pre-existing artifacts or create a second service. No
Firebase Hosting changes are part of this deployment.

Pricing references retained from the existing model (not revalidated for this cap change):

- [Cloud Run pricing](https://cloud.google.com/run/pricing): request-based active
  CPU/memory, shared free tier, idle min-instance pricing. Keeping 1 vCPU/512 MiB
  warm for 20 days alone would be $6.48 before model use, so minimum is zero.
- [Vertex pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en):
  Gemini 2.5 Flash Live audio $3/M input and $12/M output; text $0.50/M input and
  $2/M output; repeated context and transcription billing. The page's documented
  25-token/sec audio conversion is for 2.0; using it here is explicitly an estimate.
- [Cloud Run runtime contract](https://docs.cloud.google.com/run/docs/container-contract):
  filesystem loss and instance replacement.
- [Maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances):
  brief overshoot can occur.
- [Cloud Build pricing](https://cloud.google.com/build/pricing) and
  [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing):
  build/image allowance must be included rather than counted as free by default.

## Release evidence

Retain the service URL/revision/describe JSON, runtime account/binding receipt,
full test/typecheck/build logs, ZIP checksum, clean Chrome for Testing profile,
connected-host screenshot and typed/spoken reply evidence outside the worktree.
Report each check as PASS, FAIL or NOT RUN. A successful source build is not proof
of model access or a working extension. Follow the worker's no-mistakes handoff;
never merge as part of this deployment task.
