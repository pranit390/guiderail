import type { CompiledJourney } from "../../shared/journey.ts";
import type { PageSnapshot } from "./messages.ts";
import { norm } from "./page.ts";

export type StepObservation = { state: "visible" | "missing" | "ambiguous"; text: string; target?: string; role?: string };
export function observeStep(control: string, page: PageSnapshot): StepObservation {
  const matches = page.elements.filter((e) => norm(e.name) === norm(control));
  if (matches.length > 1) return { state: "ambiguous", text: `More than one ${control} is visible. Choose the control yourself, then re-read.` };
  if (!matches.length) return { state: "missing", text: `The doc says ${control}. I can't see it on this screen.` };
  return { state: "visible", text: `${control} is visible. You operate this control.`, target: matches[0].name, role: matches[0].role };
}

export function mountJourneyWalk(parent: HTMLElement, journey: CompiledJourney, read: () => Promise<PageSnapshot>, point: (text: string, role: string | undefined) => Promise<unknown>, changed: (text: string) => void) {
  const rows = [...parent.querySelectorAll<HTMLLIElement>("li")];
  let current = 0;
  let busy = false;
  let enabled = true;
  let revision = 0;
  const statuses = rows.map(() => "Not checked on this screen.");
  const controls = document.createElement("div");
  const status = document.createElement("p");
  const reread = document.createElement("button"); reread.type = "button"; reread.textContent = "Read and point to Step";
  const next = document.createElement("button"); next.type = "button"; next.textContent = "I did this · Next step"; next.disabled = true;
  const skip = document.createElement("button"); skip.type = "button"; skip.textContent = "Skip this Step explicitly";
  const labels = rows.map((row) => { const label = document.createElement("p"); row.append(label); return label; });
  controls.append(status, reread, next, skip); parent.prepend(controls);
  function render() {
    rows.forEach((row, i) => { row.toggleAttribute("data-current", i === current); if (i === current) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current"); labels[i].textContent = statuses[i]; });
    status.textContent = current < rows.length ? `Step ${current + 1}: ${journey.steps[current].control}. ${statuses[current]}` : "All Steps reviewed. GuideRail has not verified database creation.";
    reread.disabled = !enabled || busy || current >= rows.length; skip.disabled = reread.disabled;
    if (current >= rows.length) next.disabled = true;
  }
  async function refresh() {
    if (!enabled || busy || current >= rows.length) return;
    const reading = revision;
    busy = true; next.disabled = true; render();
    try {
      const snapshot = await read();
      if (reading !== revision) return;
      const observation = observeStep(journey.steps[current].control, snapshot);
      statuses[current] = observation.text;
      if (observation.target) {
        const result = await point(observation.target, observation.role);
        if (reading !== revision) return;
        if (!result || typeof result !== "object" || !("found" in result) || result.found !== true) throw new Error("The control changed or could not be highlighted. Re-read before continuing.");
        next.disabled = journey.steps[current].control === "Create";
      }
      changed(`${observation.text} Source: ${journey.steps[current].citationHeading}.`);
    } catch (error) { if (reading !== revision) return; statuses[current] = error instanceof Error ? error.message : "The page could not be read."; }
    finally { busy = false; reread.textContent = "Re-read this Step"; render(); }
  }
  function advance(skipped: boolean) {
    if (!enabled || busy || current >= rows.length) return;
    if (!skipped && next.disabled) return;
    statuses[current] = skipped ? "Explicitly skipped by you; not verified." : "You reported this Step done; not independently verified.";
    changed(`${journey.steps[current].control}: ${statuses[current]}`);
    current++; next.disabled = true; render();
  }
  reread.addEventListener("click", () => void refresh());
  next.addEventListener("click", () => advance(false));
  skip.addEventListener("click", () => advance(true));
  render();
  return { setEnabled(value: boolean) { enabled = value; revision++; next.disabled = true; render(); }, invalidate(message: string) { revision++; if (current < rows.length) statuses[current] = message; next.disabled = true; render(); } };
}
