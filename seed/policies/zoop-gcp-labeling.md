# Zoop GCP Resource Labeling Policy

Applies to all projects under the `zoop.one` organization. Effective July 2026. Owned by Infrastructure.

Every resource that supports labels must carry the 5 mandatory labels. This covers VMs, disks, buckets, Cloud SQL, GKE clusters and node pools, Cloud Functions, **Cloud Run services**, Pub/Sub topics, BigQuery datasets and the GCP projects themselves.

## Mandatory labels

| Key | Meaning | Allowed values |
|---|---|---|
| `environment` | Deployment environment | `prod`, `uat`, `dev`, `test` |
| `application` | Product or service the resource belongs to (main billing group-by) | Free text, one canonical name per app (`ocr-service`, never `ocr-svc`) |
| `component` | Role of the resource within the app | Prefer `api`, `frontend`, `backend`, `db`, `cache`, `worker`, `queue`, `storage`, `lb` |
| `owner` | Team or person responsible for cost, patching and removal | Team name or first name. No `@`, no dots |
| `managed-by` | How the resource is created and managed | `terraform`, `manual`, `gcp` |

## Optional labels

Use these only where they apply. Don't invent new keys without Infra approval.

- `customer`: resource dedicated to one client, e.g. `customer=acme-bank`
- `expiry`: temporary resources, e.g. `expiry=2026-08-01`
- `cost-center`: only if finance needs a budget line different from `owner`

## Format

- Lowercase letters, numbers and hyphens only. Use hyphens, not underscores or camelCase.
- Max 63 characters per key or value.
- No emails or special characters in values.
- Don't put the resource name in a label. Labels describe purpose.
- Console-created resources use `managed-by=manual`.

## Labels vs tags

GCP network tags and org-level tags are reserved for Infrastructure. Always use **labels** for cost and ownership.
