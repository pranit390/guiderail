import type { FormState } from "./messages.ts";

export const FIRESTORE_TEST_MODE = "Start in test mode";
export const FIRESTORE_PRODUCTION_MODE = "Start in production mode";
export const FIRESTORE_LOCATION_GUIDANCE = "Choose the location carefully before Create: a database's location cannot be changed after creation.";
export const FIRESTORE_LOCATIONS_DOC = "https://firebase.google.com/docs/firestore/locations";
export const FIRESTORE_MODES_DOC = "https://firebase.google.com/docs/firestore/manage-databases";

/** Absence or a changed control contract is unknown, never a passed security check. */
export function firestoreGuardStatus(form: FormState): "test" | "production" | "unknown" | null {
  if (!/^console\.firebase\.google\.com\/project\/[^/]+\/firestore(?:\/|$)/.test(form.url)) return null;
  const test = form.fields[FIRESTORE_TEST_MODE];
  const production = form.fields[FIRESTORE_PRODUCTION_MODE];
  if (test === "checked" && production === "") return "test";
  if (production === "checked" && test === "") return "production";
  return "unknown";
}

export function renderFirestoreGuidance(region: HTMLElement, form: FormState): void {
  const status = firestoreGuardStatus(form);
  region.hidden = status === null;
  if (status === null) { region.replaceChildren(); return; }
  const heading = document.createElement("h2");
  heading.textContent = "Firestore before Create";
  const mode = document.createElement("p");
  mode.setAttribute("role", "status");
  mode.textContent = status === "unknown"
    ? "Security mode not checked: I can't read both expected choices and one selection. Open Configure and re-read; missing or changed controls are unknown."
    : status === "test"
      ? "Test mode is selected. Choose Production mode to clear the company Rule."
      : "Production mode is selected. The Test-mode Rule does not fire; this does not verify all database security.";
  const location = document.createElement("p");
  location.textContent = FIRESTORE_LOCATION_GUIDANCE;
  const guard = document.createElement("p");
  guard.textContent = "You click Create. With a blocking Violation, GuideRail holds the first click; a second click within 10 seconds continues anyway. This is a soft guard, not cloud enforcement.";
  const sources = document.createElement("p");
  for (const [text, href] of [["Security modes", FIRESTORE_MODES_DOC], ["Cloud Firestore locations", FIRESTORE_LOCATIONS_DOC]]) {
    const link = document.createElement("a");
    link.textContent = text; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
    sources.append(link, document.createTextNode(" "));
  }
  region.replaceChildren(heading, mode, location, sources, guard);
}
