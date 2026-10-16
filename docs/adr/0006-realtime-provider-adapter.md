# Realtime voice sits behind a provider adapter: OpenAI-compatible router in development, Vertex Live in production

The side panel speaks GuideRail's own small protocol (`audio`, `text`, `toolCall`, `toolResult`, `transcript`, `resumption`) to the relay, and the relay picks a `RealtimeProvider`: `RouterRealtimeProvider` (an internal OpenAI-compatible router serving `gpt-realtime`, used during development because its cost isn't ours) or `VertexLiveProvider` (`gemini-live-2.5-flash-native-audio`, used for the submission, demo video and judging, which must run on Gemini). The adapter converts audio rates (24 kHz vs 16 kHz input), tool-call events and tool schemas (JSON Schema vs Gemini's OpenAPI subset).

## Consequences

- Prompt and tool behaviour tuned on GPT won't carry over exactly, so the switch to Vertex happens **by the end of Day 2**, leaving Day 3 to re-tune and record.
- Live session resumption is Gemini-only. On the router, resume falls back to re-seeding the session from the Journey summary in Firestore, which is the same path used when a Gemini handle has expired.
- No router credentials in the repo: the key lives in a gitignored `api/.env.local`, and the router is never reachable from the deployed service.
