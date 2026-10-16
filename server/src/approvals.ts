import { randomInt } from "node:crypto";

// An Approver's decision on what a Requester needs to clear a permission_denied Blocker.
export type Approval = {
  id: string;
  requester: string;
  role: string;
  resource: string;
  reason: string;
  status: "pending" | "granted" | "rejected";
  createdAt: number;
  expiresAt: number;
};

export type NewApproval = Pick<Approval, "requester" | "role" | "resource" | "reason">;

// Storage seam: in memory for now, Firestore later.
export interface ApprovalStore {
  create(input: NewApproval): Promise<Approval>;
  get(id: string): Promise<Approval | undefined>;
  setStatus(id: string, status: Approval["status"]): Promise<Approval | undefined>;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function newId() {
  let id = "apr_";
  for (let i = 0; i < 8; i++) id += BASE36[randomInt(36)];
  return id;
}

export const isExpired = (a: Approval, now = Date.now()) => now >= a.expiresAt;

export class MemoryApprovalStore implements ApprovalStore {
  private items = new Map<string, Approval>();

  async create(input: NewApproval) {
    const now = Date.now();
    const approval: Approval = { id: newId(), ...input, status: "pending", createdAt: now, expiresAt: now + TTL_MS };
    this.items.set(approval.id, approval);
    return approval;
  }

  async get(id: string) {
    return this.items.get(id);
  }

  async setStatus(id: string, status: Approval["status"]) {
    const approval = this.items.get(id);
    if (approval) approval.status = status;
    return approval;
  }
}

export const approvals: ApprovalStore = new MemoryApprovalStore();

// Least-privilege predefined role for a permission named in a "permission denied" message.
const ROLES: Record<string, { role: string; title: string }> = {
  "run.services.create": { role: "roles/run.developer", title: "Cloud Run Developer" },
  "run.services.update": { role: "roles/run.developer", title: "Cloud Run Developer" },
  "run.services.get": { role: "roles/run.viewer", title: "Cloud Run Viewer" },
  "iam.serviceAccounts.actAs": { role: "roles/iam.serviceAccountUser", title: "Service Account User" },
  "storage.buckets.create": { role: "roles/storage.admin", title: "Storage Admin" },
  "storage.objects.create": { role: "roles/storage.objectCreator", title: "Storage Object Creator" },
  "storage.objects.get": { role: "roles/storage.objectViewer", title: "Storage Object Viewer" },
  "cloudfunctions.functions.create": { role: "roles/cloudfunctions.developer", title: "Cloud Functions Developer" },
  "compute.instances.create": { role: "roles/compute.instanceAdmin.v1", title: "Compute Instance Admin (v1)" },
  "artifactregistry.repositories.uploadArtifacts": { role: "roles/artifactregistry.writer", title: "Artifact Registry Writer" },
};

export function lookupRole(permission: string) {
  return ROLES[permission.trim()] ?? null;
}

// Title shown in the IAM role picker, e.g. roles/run.developer -> Cloud Run Developer.
export function roleTitle(role: string) {
  return Object.values(ROLES).find((r) => r.role === role)?.title ?? role;
}

export const approvalUrl = (id: string) => `http://localhost:${process.env.PORT ?? 8787}/a/${id}`;
