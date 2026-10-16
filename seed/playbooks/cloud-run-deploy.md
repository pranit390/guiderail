---
id: cloud-run-deploy
appliesTo: ["console.cloud.google.com/run*"]
goals: ["deploy", "cloud run", "create service"]
rules: [label-required-*, env-enum, owner-format, managed-by-enum, label-format, iam-no-owner, sa-no-keys]
---

# Deploying a Cloud Run service (example org)

1. Region is `us-central1` unless the user says it's for an EU customer.
2. Use a dedicated service account named `sa-<application>`. Never use the default compute service account.
3. If permission is denied, the Approver is the project admin. Request `roles/run.developer` (plus `roles/iam.serviceAccountUser` on the service account).
4. Labels are required. Explain the 5 mandatory labels and suggest values before the user types. Console deploys use `managed-by=manual`.
5. Don't create service account keys.

## Quirks

- The Labels section is collapsed under "Container(s), Volumes, Networking, Security". Expand it first.
- Labels are added one row at a time with "Add label".
