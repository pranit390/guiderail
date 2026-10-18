---
id: view-cloud-run-logs
appliesTo: ["console.cloud.google.com/run*", "console.cloud.google.com/logs*"]
goals: ["view cloud run logs", "cloud run logs", "service logs"]
---

# Viewing Cloud Run service logs

Read-only. Guide never changes the service. Source: https://cloud.google.com/run/docs/logging

1. Open Cloud Run in the project the user names. They pick the project themselves.
2. Click the service name in the Services list.
3. Open the Logs tab on the service page.
4. Filter by severity, for example Error, to find failures fast.
5. To search across revisions, use "View in Logs Explorer". Source: https://cloud.google.com/logging/docs/view/logs-explorer-interface

## Quirks

- Logs can take a few seconds to show. Ask the user to wait before they refresh.
