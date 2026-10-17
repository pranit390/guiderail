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
The status reads **Connected to <host>** only after Vertex Live acknowledges setup.
Typing works without microphone permission.

## Runtime and admission

One Cloud Run service, `guiderail-coach`, in `zoop-innovation/us-central1`:
request-based CPU billing, 1 vCPU, 512 MiB, minimum 0, maximum 1, concurrency 10,
timeout 3600 seconds, session affinity, no startup CPU boost. Attach only
`guiderail-coach@zoop-innovation.iam.gserviceaccount.com`, with the project binding
`roles/aiplatform.user`. No service-account keys are needed.

Set `DISABLE_DRAFT=true` to disable the billable Playbook draft endpoint, and
`DEMO_END_AT=2026-11-07T00:00:00Z` to end new demo admission after judging.
Set `PUBLIC_ORIGIN` to the deployed HTTPS origin to enable same-origin token
issuance. Extension origins are also accepted; unrelated browser origins are not.

The extension obtains a one-use, 60-second credential from `POST /session`.
The server binds it to a fresh anonymous UUID and the issuing Origin, then consumes
it before opening Vertex Live. Missing, expired, replayed or wrong-origin
credentials fail closed. Outstanding credentials are bounded to 128 per instance.
These are anonymous capabilities, **not Firebase authentication**. There are no
user accounts, durable identity claims or durable receipts in this deployment.
The parent issue's Firebase identity integration remains a separate prerequisite.

At most three Live sessions run per instance. The fourth receives an explicit
**coach is busy** message. The shared allowance is three aggregate Live minutes
per UTC day per instance: three simultaneous clients exhaust it in one minute.
Disconnected clients stop consuming time. Each session also has a ten-minute
upper limit, eight completed replies, a 512-output-token limit per response,
24,000 input text characters, a 64 KiB WebSocket frame limit, and PCM input paced
to real time with a two-second burst. Context compression targets 4,096 tokens
after an 8,192-token trigger. The shared daily allowance will normally close a
session before the ten-minute upper limit. Reconnect consumes another credential
and the remaining daily allowance; it does not restore minutes in that instance.

## Expected cost commitment through 6 November 2026

This is an **expected-spend commitment below USD 6**, as clarified by firstmate;
it is not a mathematical guarantee. Use a conservative 21 UTC-date allowance
covering deployment on 17 October UTC through 6 November: 21 × 3 = 63 aggregate
Live minutes. Do not assume Cloud Run's shared billing-account free tier remains
available.

| Component | Planning assumption | Expected USD |
|---|---|---:|
| Live audio | 25 tokens/second in each direction, continuous audio at $3/M input and $12/M output; 63 × $0.0225 | 1.4175 |
| Live context/text | Additional reserve equal to base audio for repeated context and transcription/text; short eight-reply sessions | 1.4175 |
| Cloud Run active compute | 3,780 s at $0.000024/vCPU-s + 0.5 × $0.0000025/GiB-s; no free-tier discount | 0.0955 |
| Startup, HTTP, network and logs | Small judge traffic, short requests, bounded payloads; reserve | 0.30 |
| Two source builds and one retained image | Small Node builds, one corrected retry; image held through judging; reserve | 0.50 |
| **Planning total** | Rounded upward | **3.74** |
| **Margin to $6** | Approximately | **2.26** |

The 25-token/sec conversion is a planning assumption, not a verified native-audio
upper bound. Vertex bills tokens, including accumulated session context again on
each turn and text transcription. The context reserve assumes short judge
conversations rather than adversarial input. The Cloud Build/image reserve is an
estimate, not a provider-enforced cap.

Residual risks: instance replacement/scale-to-zero/redeployment resets the
in-memory daily counter and capabilities; Cloud Run maximum instances may briefly
be exceeded; public HTTP traffic and repeated startup still incur charges even
when Live admission is closed; context/turn/token usage and network traffic vary.
No project-wide budgets, billing changes, persistent ledger or extra database are
created. Source deployment may create the explicitly authorized
`cloud-run-source-deploy` Artifact Registry repository and its source-build
artifacts. Do not delete pre-existing artifacts or create a second service. No
Firebase Hosting changes are part of this deployment.

Sources checked 18 October 2026:

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
