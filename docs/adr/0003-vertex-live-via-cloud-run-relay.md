---
status: proposed
---

# Voice goes through a Cloud Run relay to the Vertex Live API

The side panel streams audio over WebSocket to Cloud Run, which connects to the Vertex AI Live API (`gemini-live-2.5-flash-native-audio`) with its service account. The alternative, used by SupaMaus, is a restricted Gemini Developer API key in Secret Manager and short-lived tokens so the browser connects directly. That is lower latency, but it puts an API credential in Zoop's org project and isn't Vertex. We accept about half a day of proxy work and a little latency so there are no keys anywhere. Cloud Run needs `--timeout 3600`, session affinity and `--min-instances 1`.
