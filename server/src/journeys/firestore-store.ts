import type { Firestore } from "firebase-admin/firestore";
import { CompileError, parseCompiledJourney, type CompiledJourney } from "../../../shared/journey.ts";
import { getDatabase } from "../firestore.ts";
import { journeyCacheKey, type JourneyStore } from "./store.ts";

export class FirestoreJourneyStore implements JourneyStore {
  constructor(private db: Firestore = getDatabase()) {}
  async get() {
    const snapshot = await this.db.collection("journeys").doc(journeyCacheKey).get();
    if (!snapshot.exists) return undefined;
    try { return parseCompiledJourney(snapshot.data()); }
    catch (error) {
      if (error instanceof CompileError) return undefined;
      throw error;
    }
  }
  async put(journey: CompiledJourney) {
    const valid = parseCompiledJourney(journey);
    await this.db.collection("journeys").doc(journeyCacheKey).set(valid);
  }
}
