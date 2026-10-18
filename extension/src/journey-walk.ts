import type { CompiledJourney } from "../../shared/journey.ts";
import type { PageSnapshot } from "./messages.ts";
import { resolveName } from "./resolve.ts";

export type StepObservation = { state: "visible" | "missing" | "ambiguous"; text: string; target?: string; role?: string };
export function observeStep(control: string, page: PageSnapshot): StepObservation {
  const match = resolveName(control, page.elements);
  if (match.status === "ambiguous") return { state: "ambiguous", text: `More than one ${control} is visible. Choose the control yourself, then re-read.` };
  if (match.status === "missing") return { state: "missing", text: `The doc says ${control}. I can't see it on this screen.` };
  const element = page.elements.find((e) => e.i === match.i)!;
  return { state: "visible", text: `${match.name} is visible. You operate this control.`, target: match.name, role: element.role };
}

export function mountJourneyWalk(parent: HTMLElement, journey: CompiledJourney, read: () => Promise<PageSnapshot>, point: (text: string, role: string | undefined) => Promise<unknown>, changed: (text: string) => void, clear: () => Promise<unknown> = async () => {}, currentRegion: HTMLElement = parent) {
  const rows = [...parent.querySelectorAll<HTMLLIElement>("li")];
  let current = 0;
  let busy = false;
  let enabled = true;
  let revision = 0;
  let observed = -1;
  // The highlighted Step survives a same-tab route change so its click, validated asynchronously, can still be recorded.
  let pointed = -1;
  let acted = -1;
  const statuses = rows.map(() => "Not checked on this screen.");
  const controls = document.createElement("div");
  const status = document.createElement("p");
  const reread = document.createElement("button"); reread.type = "button"; reread.textContent = "Read and point to Step";
  const next = document.createElement("button"); next.type = "button"; next.textContent = "I did this · Next step"; next.disabled = true;
  const skip = document.createElement("button"); skip.type = "button"; skip.textContent = "Skip this Step explicitly";
  const labels = rows.map((row) => { const label = document.createElement("p"); row.append(label); return label; });
  const citation = document.createElement("a"); citation.className = "citation";
  citation.target = "_blank"; citation.rel = "noopener noreferrer";
  controls.className = "journey-current";
  controls.append(status, citation, reread, next, skip); currentRegion.prepend(controls);
  currentRegion.hidden = false;
  function render() {
    rows.forEach((row, i) => { row.toggleAttribute("data-current", i === current); if (i === current) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current"); labels[i].textContent = statuses[i]; });
    status.textContent = current < rows.length ? `Step ${current + 1}: ${journey.steps[current].control}. ${statuses[current]}` : "All Steps reviewed. GuideRail has not verified database creation.";
    const step = journey.steps[current];
    citation.hidden = !step;
    if (step) {
      citation.href = step.sourceUrl.replace(/\.md\.txt$/, "");
      citation.textContent = step.citationHeading;
      citation.setAttribute("aria-label", `Source for current Step ${current + 1}, ${step.control}: ${step.citationHeading}`);
    }
    reread.disabled = !enabled || busy || current >= rows.length; skip.disabled = reread.disabled;
    next.disabled = reread.disabled || journey.steps[current].control === "Create" || (observed !== current && acted !== current);
  }
  async function refresh() {
    if (!enabled || busy || current >= rows.length) return;
    const reading = revision;
    busy = true; observed = -1; pointed = -1; render();
    let snapshot: PageSnapshot | undefined;
    try {
      await clear();
      if (reading !== revision) return;
      snapshot = await read();
      if (reading !== revision) return;
      const observation = observeStep(journey.steps[current].control, snapshot);
      statuses[current] = observation.text;
      if (observation.target) {
        const result = await point(observation.target, observation.role);
        if (reading !== revision) return;
        if (!result || typeof result !== "object" || !("found" in result) || result.found !== true) throw new Error("The control changed or could not be highlighted. Re-read before continuing.");
        observed = current; pointed = current;
      }
      changed(`${observation.text} Source: ${journey.steps[current].citationHeading}.`);
    } catch (error) { if (reading !== revision) return; if (!snapshot) acted = -1; statuses[current] = error instanceof Error ? error.message : "The page could not be read."; }
    finally { busy = false; reread.textContent = "Re-read this Step"; render(); }
  }
  function advance(skipped: boolean) {
    if (!enabled || busy || current >= rows.length) return;
    if (!skipped && next.disabled) return;
    statuses[current] = skipped ? "Explicitly skipped by you; not verified." : "You reported this Step done; not independently verified.";
    changed(`${journey.steps[current].control}: ${statuses[current]}`);
    void clear();
    current++; render();
    currentRegion.scrollTop = 0;
  }
  reread.addEventListener("click", () => void refresh());
  next.addEventListener("click", () => advance(false));
  skip.addEventListener("click", () => advance(true));
  render();
  return {
    setEnabled(value: boolean) { if (!value) void clear(); enabled = value; revision++; observed = -1; pointed = -1; acted = -1; render(); },
    acted(message: string) { revision++; if (current >= rows.length) return; if (observed === current || pointed === current) acted = current; statuses[current] = message; render(); },
    invalidate(message: string, sameTab = false) { void clear(); revision++; observed = -1; if (!sameTab) { pointed = -1; acted = -1; } if (current < rows.length) statuses[current] = message; render(); },
  };
}
