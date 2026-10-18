// Deterministic test fixture; never loaded by the running server or used as provider evidence.
import { FIRESTORE_GOAL, STEP_CONTROLS, type JourneyDraft } from "../../../shared/journey.ts";
const sourceUrl = FIRESTORE_GOAL.sourceUrls[0];
const citation = { sourceUrl, citationHeading: "Create a database", explanation: "Choose this control yourself in the Firebase console." };
export const fixtureDraft: JourneyDraft = {
  goalId: FIRESTORE_GOAL.id, method: FIRESTORE_GOAL.method,
  steps: STEP_CONTROLS.map((control) => ({ ...citation, control })),
  prerequisite: { ...citation, citationHeading: "Required roles and permissions", role: "roles/datastore.owner", permission: "datastore.databases.create", explanation: "Cloud Datastore Owner is required to create a database." },
  databaseIdGuidance: { ...citation, citationHeading: "Database ID", explanation: "Use 4–63 lowercase letters, numbers and hyphens; begin with a letter and end with a letter or number, not UUID-shaped. Standard edition uses (default) when omitted. Wait about 5 minutes before reusing a deleted ID." },
  limitations: { ...citation, citationHeading: "Limitations", explanation: "A project can have 100 databases; contact support to request an increase." },
  testModeWarning: { ...citation, explanation: "Test mode allows anyone to read and overwrite your data." },
  locationWarning: { ...citation, sourceUrl: FIRESTORE_GOAL.sourceUrls[2], citationHeading: "Cloud Firestore locations", explanation: "The location cannot be changed after creation." },
};
