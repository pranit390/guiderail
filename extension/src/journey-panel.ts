import { FIRESTORE_GOAL, parseCompileResult, type Citation, type CompileResult } from "../../shared/journey.ts";
import { mountJourneyWalk } from "./journey-walk.ts";
import type { PageSnapshot } from "./messages.ts";
import { PUBLIC_DOCS } from "./document.ts";

export function mountJourneyPanel(container: HTMLElement, options: { http: string; fetch?: (url: string, init: RequestInit) => Promise<Response>; compiled: () => void; brief: () => Promise<void>; open?: () => Promise<unknown>; read?: () => Promise<PageSnapshot>; point?: (text: string, role: string | undefined) => Promise<unknown>; changed?: (text: string) => void; clear?: () => Promise<unknown>; currentRegion?: HTMLElement; reset?: () => void }) {
  container.innerHTML = `<h2>Firestore Goal</h2><p>Create a Firestore database</p>
    <button type="button" data-open>Start Firestore Journey</button>
    <button type="button" data-reset hidden>End Journey binding</button>
    <button type="button" data-compile>Read the Firestore docs</button>
    <button type="button" data-brief>Brief me from this page</button>
    <p data-status role="status">Start with public docs. No Google login, project or microphone needed.</p>
    <p data-links></p><div data-result></div>`;
  let walk: ReturnType<typeof mountJourneyWalk> | undefined;
  let enabled = true;
  let pending: Promise<void> | undefined;
  let revision = 0;
  const start = container.querySelector<HTMLButtonElement>("[data-open]")!;
  const reset = container.querySelector<HTMLButtonElement>("[data-reset]")!;
  const compile = container.querySelector<HTMLButtonElement>("[data-compile]")!;
  const brief = container.querySelector<HTMLButtonElement>("[data-brief]")!;
  const status = container.querySelector<HTMLElement>("[data-status]")!;
  const result = container.querySelector<HTMLElement>("[data-result]")!;
  const links = container.querySelector<HTMLElement>("[data-links]")!;
  PUBLIC_DOCS.forEach((url, i) => {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = i === 0 ? "Open Firestore docs" : "Open IAM grant docs";
    links.append(a, document.createElement("br"));
  });
  async function load() {
    const loading = revision;
    walk?.setEnabled(false);
    walk = undefined;
    if (options.currentRegion) { options.currentRegion.replaceChildren(); options.currentRegion.hidden = true; }
    compile.disabled = true;
    result.replaceChildren();
    status.textContent = "Reading the Firestore docs… This can take up to 90 seconds.";
    container.setAttribute("aria-busy", "true");
    try {
      const response = await (options.fetch ?? fetch)(`${options.http}/journeys/compile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalId: FIRESTORE_GOAL.id }), signal: AbortSignal.timeout(95_000) });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The docs could not be compiled.";
        throw new Error(message);
      }
      const compiled = parseCompileResult(body);
      if (loading !== revision) return;
      renderJourney(result, compiled);
      status.textContent = compiled.cacheHit ? "Loaded cited Steps from cache." : `Cited Steps ready in ${(compiled.journey.durationMs / 1000).toFixed(1)} seconds.`;
      compile.textContent = "Reload cited Steps";
      options.compiled();
      if (!reset.hidden && options.read && options.point) {
        walk = mountJourneyWalk(result, compiled.journey, options.read, options.point, options.changed ?? (() => {}), options.clear, options.currentRegion);
        walk.setEnabled(enabled);
      }
    } catch (error) {
      if (loading !== revision) return;
      status.textContent = `${error instanceof Error ? error.message : "Compilation failed."} Retry, or open the official docs above.`;
      compile.textContent = "Retry reading docs";
    } finally {
      if (loading === revision) {
        compile.disabled = !enabled;
        container.removeAttribute("aria-busy");
      }
    }
  }
  function ensureLoaded() {
    if (!pending) {
      const request = load().finally(() => { if (pending === request) pending = undefined; });
      pending = request;
    }
    return pending;
  }
  compile.addEventListener("click", () => void ensureLoaded());
  async function openJourney() {
    if (!enabled) throw new Error("Turn off Learn mode before starting a Journey.");
    start.disabled = true;
    try {
      if (!options.open) throw new Error("Console Journeys are unavailable here.");
      await options.open();
      reset.hidden = false;
      await ensureLoaded();
    } catch (error) { status.textContent = error instanceof Error ? error.message : "Could not open the Journey."; throw error; }
    finally { start.disabled = !enabled; }
  }
  start.addEventListener("click", () => void openJourney().catch(() => {}));
  function endJourney() {
    revision++; pending = undefined; walk?.setEnabled(false); options.reset?.(); walk = undefined;
    if (options.currentRegion) { options.currentRegion.replaceChildren(); options.currentRegion.hidden = true; }
    compile.disabled = !enabled; container.removeAttribute("aria-busy");
    result.replaceChildren(); reset.hidden = true;
    status.textContent = "Journey ended. Start again to bind a new tab.";
  }
  reset.addEventListener("click", endJourney);
  brief.addEventListener("click", async () => {
    brief.disabled = true;
    status.textContent = "Reading the visible document…";
    try { await options.brief(); status.textContent = "Briefing requested. You can type follow-up questions below."; }
    catch (error) { status.textContent = `${error instanceof Error ? error.message : "Couldn't brief this page."} Open a public doc above and retry.`; }
    finally { brief.disabled = !enabled; }
  });
  return { openJourney, endJourney, pointed(name: string) { walk?.pointed(name); }, acted(message: string) { walk?.acted(message); }, invalidate(message: string, sameTab = false) { walk?.invalidate(message, sameTab); }, setEnabled(value: boolean) { enabled = value; walk?.setEnabled(value); reset.disabled = !value; compile.disabled = !enabled; brief.disabled = !enabled; start.disabled = !enabled; } };
}
function appendCitation(parent: HTMLElement, item: Citation, context: string) {
  const p = document.createElement("p"); p.textContent = item.explanation;
  const a = document.createElement("a"); a.href = item.sourceUrl.replace(/\.md\.txt$/, "");
  a.className = "citation"; a.textContent = item.citationHeading; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", `Source for ${context}: ${item.citationHeading}`);
  parent.append(p, a);
}
export function renderJourney(parent: HTMLElement, { journey }: CompileResult) {
  parent.replaceChildren();
  const note = document.createElement("p");
  note.textContent = "From vendor documentation · Firebase console · Unverified on your screen. Company Policy comes from approved Rules and Teach Playbooks.";
  parent.append(note);
  const details = document.createElement("details");
  const summary = document.createElement("summary"); summary.textContent = "Prerequisite, Database ID and warnings";
  details.append(summary); details.open = false;
  for (const [context, item] of Object.entries({ Prerequisite: journey.prerequisite, "Database ID": journey.databaseIdGuidance, Limits: journey.limitations, "Test mode warning": journey.testModeWarning, "Location warning": journey.locationWarning })) appendCitation(details, item, context);
  parent.append(details);
  const list = document.createElement("ol");
  for (const [index, step] of journey.steps.entries()) {
    const li = document.createElement("li");
    const title = document.createElement("strong"); title.textContent = step.control === "Create" ? "You click Create" : step.control;
    li.append(title); appendCitation(li, step, `Step ${index + 1}, ${step.control}`); list.append(li);
  }
  const template = document.createElement("details");
  const templateSummary = document.createElement("summary"); templateSummary.textContent = "All cited Steps and progress";
  template.append(templateSummary, list); parent.append(template);
}
