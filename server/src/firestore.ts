import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData, type DocumentReference, type Firestore } from "firebase-admin/firestore";

// The Admin SDK uses Application Default Credentials, including the Cloud Run service account.
export function getDatabase(): Firestore {
  const app = getApps()[0] ?? initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
  });
  return getFirestore(app);
}

export async function writeOwnedDocument(db: Firestore, ref: DocumentReference, body: DocumentData, ownerUid?: string) {
  await db.runTransaction(async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    const now = new Date().toISOString();
    transaction.set(ref, {
      ...body, ownerUid: ownerUid ?? null,
      createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
      updatedAt: now,
    });
  });
}
