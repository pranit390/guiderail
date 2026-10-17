// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountJourneyPanel } from "./journey-panel.ts";
import { fixtureDraft } from "../../server/src/journeys/fixture.ts";
import { FIRESTORE_GOAL } from "../../shared/journey.ts";
const fixture = { cacheHit: true, journey: { ...fixtureDraft, consoleUrl: FIRESTORE_GOAL.consoleUrl, version: FIRESTORE_GOAL.version, durationMs: 100, compiledAt: "2026-10-17T23:00:00Z", retrieval: FIRESTORE_GOAL.sourceUrls.map((retrievedUrl) => ({ retrievedUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" })) } };
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
function mount() {
  const container = document.createElement("section"); document.body.append(container);
  const compiled = vi.fn();
  mountJourneyPanel(container, { http: "http://localhost:8826", compiled, brief: async () => { throw new Error("No visible document section was found."); } });
  return { container, compiled, button: container.querySelector<HTMLButtonElement>("[data-compile]")! };
}
describe("Journey panel", () => {
  it("shows loading, validated cited Steps and cache status", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal("fetch", fetcher);
    const { container, compiled, button } = mount();
    button.click();
    expect(container.textContent).toContain("Reading the Firestore docs");
    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(compiled).toHaveBeenCalledOnce());
    expect(container.querySelectorAll("li")).toHaveLength(10);
    expect(container.textContent).toContain("Unverified on your screen");
    expect(container.textContent).toContain("You click Create");
    expect(container.textContent).toContain("from cache");
    expect(container.querySelector("li a")?.getAttribute("href")).toBe(FIRESTORE_GOAL.sourceUrls[0]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ goalId: FIRESTORE_GOAL.id });
  });
  it("keeps a retry and official-docs fallback after a readable server failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Source retrieval failed" }), { status: 502 })));
    const { container, compiled, button } = mount(); button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Retry reading docs"));
    expect(container.textContent).toContain("Source retrieval failed");
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(compiled).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });
  it("rejects malformed success instead of telling Live to use it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ cacheHit: true, journey: {} }))));
    const { container, compiled, button } = mount(); button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("Retry reading docs"));
    expect(compiled).not.toHaveBeenCalled();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
  it("reports absent public text without inventing a briefing", async () => {
    const { container } = mount(); container.querySelector<HTMLButtonElement>("[data-brief]")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("No visible document section was found"));
  });
});
