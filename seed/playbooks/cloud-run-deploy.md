---
id: cloud-run-deploy
appliesTo: ["console.cloud.google.com/run*"]
goals: ["deploy", "cloud run", "create service", "labels"]
rules: [label-required-*, env-enum, owner-format, managed-by-enum, label-format, iam-no-owner, sa-no-keys]
---

# Deploying a Cloud Run service (example org)

1. Region is `us-central1` unless the user says it's for an EU customer.
2. Use a dedicated service account named `sa-<application>`. Never use the default compute service account.
3. If permission is denied, the Approver is the project admin. Request `roles/run.developer` (plus `roles/iam.serviceAccountUser` on the service account).
4. The org requires 5 labels on every service. Explain them and the suggested values **before** the user clicks Create, even though the create form has no Labels field.
5. Don't create service account keys.

## Where labels go in Cloud Run (verified against Google's docs)

- The **Create service form has no Labels field.** Don't send the user looking for one.
- Labels are added **after** creating, on the Cloud Run **Services** list:
  1. Tick the checkbox to the left of the service.
  2. Turn on **Show info panel** (far right) if it's hidden.
  3. Open the **Labels** tab in the info panel.
  4. Click **Add label** for each key, enter the key and value.
  5. Click **Save**.
- Alternative at deploy time: `gcloud run deploy SERVICE --image IMAGE --labels environment=dev,application=APP,component=api,owner=NAME,managed-by=manual`
- Labels set this way apply to the service and its revision.

## Console quirks

- Advanced settings are under the collapsible heading **"Containers, networking, security"**, with tabs Containers, Networking, Security, Settings, Variables & Secrets, Volumes. None of them holds labels.
