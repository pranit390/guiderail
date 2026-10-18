import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// The Admin SDK uses Application Default Credentials, including the Cloud Run service account.
export function getDatabase(): Firestore {
  const app = getApps()[0] ?? initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
  });
  return getFirestore(app);
}
