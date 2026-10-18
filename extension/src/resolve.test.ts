// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { PageElement } from "./messages.ts";
import { collectControls } from "./page.ts";
import {
  actionAuthorized,
  authorizeTarget,
  highlightOutcome,
  highlightResult,
  liveHighlight,
  MIN_CONFIDENCE,
  resolveName,
  type BoundSnapshot,
} from "./resolve.ts";

function layOut() {
  const rect = { x: 0, y: 0, width: 80, height: 24, top: 0, left: 0, bottom: 24, right: 80, toJSON() { return {}; } } as DOMRect;
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    el.getBoundingClientRect = () => rect;
    el.style.opacity = "1";
  }
}

function elementsOf(): PageElement[] {
  return collectControls().map(({ i, role, name, value, section }) => {
    const item: PageElement = { i, role, name };
    if (value) item.value = value;
    if (section) item.section = section;
    return item;
  });
}

function snapshot(elements: PageElement[], tabId = 7): BoundSnapshot {
  return { tabId, url: "http://127.0.0.1/duplicate-save", generation: 3, elements };
}

beforeEach(() => {
  document.body.innerHTML = `
    <h1>Permissions</h1>
    <section aria-label="Billing"><button type="button">Save</button></section>
    <section aria-label="Security"><button type="button">Save</button></section>
    <label for="db">Database ID</label><input id="db">`;
  layOut();
});

describe("duplicate-Save fixture", () => {
  it("asks which Save and does not select the first button", () => {
    const elements = elementsOf();
    const saves = elements.filter((e) => e.name === "Save");
    expect(saves.map((e) => e.section)).toEqual(["Billing", "Security"]);
    expect(saves[0].i).toBeLessThan(saves[1].i);

    const decision = authorizeTarget({ text: "Save", role: "button", snapshot: snapshot(elements), stale: false, tabId: 7 });
    expect(decision.authorized).toBe(false);
    expect(actionAuthorized(decision)).toBe(false);
    expect(decision).not.toHaveProperty("i");
    if (decision.authorized || decision.reason !== "ambiguous") throw new Error("expected an ambiguous Save");
    expect(decision.alternatives).toEqual(["Billing: Save", "Security: Save"]);
    expect(highlightResult(decision)).toMatchObject({ found: false, reason: "ambiguous" });
    expect(highlightResult(decision)).not.toHaveProperty("i");
    expect(highlightOutcome(decision)).toBe('Which "Save" should I point at? I see Billing: Save or Security: Save.');
  });
});

describe("indistinguishable ties", () => {
  const apart = (text: string) => `I see more than one "${text}" here that I can't tell apart, so I won't point at either. Tell me what's near the one you mean.`;

  it.each([
    { where: "outside any labelled region", elements: [{ i: 1, role: "button", name: "Save" }, { i: 2, role: "button", name: "Save" }] },
    { where: "inside the same section", elements: [{ i: 1, role: "button", name: "Save", section: "Billing" }, { i: 2, role: "button", name: "Save", section: "Billing" }] },
  ])("does not offer a choice between exact Saves $where", ({ elements }) => {
    const decision = authorizeTarget({ text: "Save", role: "button", snapshot: snapshot(elements), stale: false, tabId: 7 });
    expect(actionAuthorized(decision)).toBe(false);
    if (decision.authorized) throw new Error("expected an ambiguous Save");
    expect(decision).toMatchObject({ reason: "ambiguous", alternatives: [] });
    expect(highlightOutcome(decision)).toBe(apart("Save"));
  });

  it("does not offer a choice between identical fuzzy candidates", () => {
    const elements: PageElement[] = [
      { i: 1, role: "textbox", name: "Database ID", section: "Database" },
      { i: 2, role: "textbox", name: "Database ID", section: "Database" },
    ];
    const decision = authorizeTarget({ text: "Database", snapshot: snapshot(elements), stale: false, tabId: 7 });
    if (decision.authorized) throw new Error("expected an ambiguous Database");
    expect(decision).toMatchObject({ reason: "ambiguous", alternatives: [] });
    expect(highlightOutcome(decision)).toBe(apart("Database"));
  });
});

describe("answerable choices", () => {
  it("does not offer a sectioned and an unsectioned Save, since the bare Save cannot be selected", () => {
    const elements: PageElement[] = [
      { i: 1, role: "button", name: "Save", section: "Billing" },
      { i: 2, role: "button", name: "Save" },
    ];
    const decision = authorizeTarget({ text: "Save", role: "button", snapshot: snapshot(elements), stale: false, tabId: 7 });
    if (decision.authorized) throw new Error("expected an ambiguous Save");
    expect(decision).toMatchObject({ reason: "ambiguous", alternatives: [] });
    expect(highlightOutcome(decision)).toBe(`I see more than one "Save" here that I can't tell apart, so I won't point at either. Tell me what's near the one you mean.`);
  });

  it("offers fuzzy choices without sections, and each option text selects its own control", () => {
    const elements: PageElement[] = [
      { i: 1, role: "textbox", name: "Database ID" },
      { i: 2, role: "textbox", name: "Database location" },
    ];
    const decision = authorizeTarget({ text: "Database", snapshot: snapshot(elements), stale: false, tabId: 7 });
    if (decision.authorized || decision.reason !== "ambiguous") throw new Error("expected an ambiguous Database");
    expect(decision.alternatives).toEqual(["Database ID", "Database location"]);
    expect(highlightOutcome(decision)).toBe('Which "Database" should I point at? I see Database ID or Database location.');
    expect(decision.alternatives.map((text) => resolveName(text, elements))).toEqual([
      { status: "found", i: 1, name: "Database ID", confidence: 1 },
      { status: "found", i: 2, name: "Database location", confidence: 1 },
    ]);
  });
});

describe("section qualifier", () => {
  it("resolves the person's answer by section argument or by the Section: Name label the ask lists", () => {
    const elements = elementsOf();
    const [billing, security] = elements.filter((e) => e.name === "Save");
    expect(resolveName("Save", elements, "button", "Billing")).toMatchObject({ status: "found", i: billing.i, confidence: 1 });
    expect(resolveName("Save", elements, "button", "security")).toMatchObject({ status: "found", i: security.i });
    expect(resolveName("Billing: Save", elements, "button")).toMatchObject({ status: "found", i: billing.i, name: "Save", confidence: 1 });
    expect(resolveName("Save", elements, "button", "Shipping").status).toBe("missing");
    expect(resolveName("Database ID", elements, undefined, "Billing").status).toBe("missing");
  });

  it("keeps the section when the live page re-resolves the pinned Save", () => {
    const indexed = new Map(collectControls().map(({ i, el }) => [i, el] as const));
    const [billing] = elementsOf().filter((e) => e.name === "Save");
    const live = liveHighlight({ text: "Save", role: "button", section: "Billing", generation: 3, index: billing.i, name: "Save" }, 3, indexed);
    expect(live.result).toMatchObject({ found: true, i: billing.i, name: "Save" });
    expect(live.el).toBe(indexed.get(billing.i));
  });

  it("refuses as stale, not missing, when the pinned Save's region is relabelled after the read", () => {
    const indexed = new Map(collectControls().map(({ i, el }) => [i, el] as const));
    const [billing] = elementsOf().filter((e) => e.name === "Save");
    document.querySelector('section[aria-label="Billing"]')!.setAttribute("aria-label", "Billing settings");
    const live = liveHighlight({ text: "Save", role: "button", section: "Billing", generation: 3, index: billing.i, name: "Save" }, 3, indexed);
    expect(live.result).toEqual({ found: false, reason: "stale", alternatives: [] });
    expect(live.el).toBeUndefined();
  });
});

describe("exact names before fuzzy candidates", () => {
  it("picks the exact Save and leaves Save draft alone", () => {
    document.body.innerHTML = `
      <section aria-label="Billing"><button type="button">Save</button><button type="button">Save draft</button></section>`;
    layOut();
    const elements = elementsOf();
    const resolved = resolveName("SAVE", elements, "button");
    expect(resolved).toMatchObject({ status: "found", name: "Save", confidence: 1 });
    if (resolved.status === "found") expect(resolved.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    const draft = elements.find((e) => e.name === "Save draft");
    if (resolved.status === "found" && draft) expect(resolved.i).not.toBe(draft.i);
  });

  it("uses a fuzzy name only when nothing matches exactly, at or above 0.6", () => {
    const elements = elementsOf();
    const fuzzy = resolveName("Database", elements);
    expect(fuzzy.status).toBe("found");
    if (fuzzy.status === "found") {
      expect(fuzzy.name).toBe("Database ID");
      expect(fuzzy.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(fuzzy.confidence).toBeLessThan(1);
    }
    expect(resolveName("purple monkey", elements).status).toBe("missing");
    const swapped = resolveName("alpha beta", [{ i: 1, role: "textbox", name: "beta alpha" }]);
    expect(swapped.status).toBe("found");
    if (swapped.status === "found") expect(swapped.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  });

  it("lets a role break a tie and refuses a tie the role does not break", () => {
    const mixed: PageElement[] = [
      { i: 1, role: "button", name: "Save" },
      { i: 2, role: "link", name: "Save" },
    ];
    expect(resolveName("Save", mixed, "button")).toMatchObject({ status: "found", i: 1, name: "Save" });
    expect(resolveName("Save", mixed).status).toBe("ambiguous");
  });
});

describe("missing controls keep their citation", () => {
  it("states the docs and screen mismatch without dropping the citation", () => {
    const decision = authorizeTarget({
      text: "Location",
      citation: "Create a database",
      snapshot: snapshot(elementsOf()),
      stale: false,
      tabId: 7,
    });
    expect(decision).toMatchObject({
      authorized: false,
      reason: "missing",
      citation: "Create a database",
      mismatch: "The doc says Create a database. I can't see Location on this screen.",
    });
    if (decision.authorized) throw new Error("expected a missing Location");
    expect(highlightOutcome(decision)).toBe("The doc says Create a database. I can't see Location on this screen.");
    expect(actionAuthorized(decision)).toBe(false);
  });
});

describe("snapshot eligibility", () => {
  it("refuses a stale snapshot and a different tab, and does not authorize a fill", () => {
    const shot = snapshot(elementsOf());
    const stale = authorizeTarget({ text: "Database ID", snapshot: shot, stale: true, tabId: 7 });
    const otherTab = authorizeTarget({ text: "Database ID", snapshot: shot, stale: false, tabId: 9 });
    const unread = authorizeTarget({ text: "Database ID", snapshot: null, stale: false, tabId: 7 });
    for (const decision of [stale, otherTab, unread]) {
      expect(actionAuthorized(decision)).toBe(false);
      expect(decision).not.toHaveProperty("i");
      if (decision.authorized) throw new Error("expected a refusal");
      expect(highlightOutcome(decision)).toContain("won't point at or fill anything");
    }
    expect(stale).toMatchObject({ reason: "stale" });
    expect(otherTab).toMatchObject({ reason: "wrong_tab" });
    expect(unread).toMatchObject({ reason: "unbound" });
  });

  it("authorizes one target only when the name is in the latest snapshot for this tab", () => {
    const decision = authorizeTarget({ text: "Database ID", snapshot: snapshot(elementsOf()), stale: false, tabId: 7 });
    expect(actionAuthorized(decision)).toBe(true);
    if (decision.authorized) {
      expect(decision.name).toBe("Database ID");
      expect(decision.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });

  it("refuses a pinned highlight once the generation, name or node no longer match the read", () => {
    const indexed = new Map(collectControls().map(({ i, el }) => [i, el] as const));
    const db = elementsOf().find((e) => e.name === "Database ID")!;
    const [save] = elementsOf().filter((e) => e.name === "Save");
    const stale = { found: false, reason: "stale", alternatives: [] };
    expect(liveHighlight({ text: "Database ID", generation: 3, index: db.i, name: "Database ID" }, 4, indexed)).toEqual({ result: stale });
    expect(liveHighlight({ text: "Database ID", generation: 3, index: save.i, name: "Database ID" }, 3, indexed)).toEqual({ result: stale });
    indexed.get(db.i)!.remove();
    expect(liveHighlight({ text: "Database ID", generation: 3, index: db.i, name: "Database ID" }, 3, indexed)).toEqual({ result: stale });
  });

  it("refuses an unpinned highlight as unbound without pointing at anything", () => {
    const indexed = new Map(collectControls().map(({ i, el }) => [i, el] as const));
    const db = elementsOf().find((e) => e.name === "Database ID")!;
    expect(liveHighlight({ text: "Database ID" }, 3, indexed)).toEqual({ result: { found: false, reason: "unbound", alternatives: [] } });
    expect(liveHighlight({ text: "Database ID", index: db.i, name: "Database ID" }, 3, indexed).result).toMatchObject({ reason: "unbound" });
    const pinned = liveHighlight({ text: "Database ID", generation: 3, index: db.i, name: "Database ID" }, 3, indexed);
    expect(pinned.result).toMatchObject({ found: true, i: db.i, name: "Database ID" });
    expect(pinned.el).toBe(indexed.get(db.i));
  });

  it("does not point at a pinned index that is no longer the unique resolution", () => {
    document.body.innerHTML = `
      <section aria-label="Billing"><button type="button">Save</button><button type="button">Save draft</button></section>
      <section aria-label="Security"><button type="button">Save</button></section>`;
    layOut();
    const indexed = new Map(collectControls().map(({ i, el }) => [i, el] as const));
    const elements = elementsOf();
    const [save] = elements.filter((e) => e.name === "Save");
    const draft = elements.find((e) => e.name === "Save draft")!;

    const tied = liveHighlight({ text: "Save", generation: 3, index: save.i, name: "Save" }, 3, indexed);
    expect(tied.result).toEqual({ found: false, reason: "stale", alternatives: [] });
    expect(tied.el).toBeUndefined();

    indexed.get(elements.filter((e) => e.name === "Save")[1].i)!.remove();
    const other = liveHighlight({ text: "Save", generation: 3, index: draft.i, name: "Save draft" }, 3, indexed);
    expect(other.result).toEqual({ found: false, reason: "stale", alternatives: [] });
    expect(other.el).toBeUndefined();
  });
});

describe("live control set", () => {
  function pinState() {
    const controls = collectControls();
    return {
      controls,
      indexed: new Map(controls.map(({ i, el }) => [i, el] as const)),
      roles: new Map(controls.map(({ i, role }) => [i, role] as const)),
    };
  }

  it("refuses a Save that appears after the read instead of ringing the first one", () => {
    document.body.innerHTML = `<section aria-label="Billing"><button type="button">Save</button></section>`;
    layOut();
    const { indexed, roles, controls } = pinState();
    const save = controls.find((control) => control.name === "Save")!;
    document.querySelector("section")!.insertAdjacentHTML("beforeend", `<button type="button">Save</button>`);
    layOut();
    const live = liveHighlight({ text: "Save", role: "button", generation: 3, index: save.i, name: "Save" }, 3, indexed, roles);
    expect(live.result).toEqual({ found: false, reason: "stale", alternatives: [] });
    expect(live.el).toBeUndefined();
  });

  it("refuses when a hidden duplicate Save becomes visible", () => {
    document.body.innerHTML = `<section aria-label="Billing"><button type="button">Save</button></section>
      <section aria-label="Security"><button type="button" id="hidden-save">Save</button></section>`;
    const hidden = document.getElementById("hidden-save") as HTMLElement;
    hidden.style.display = "none";
    layOut();
    const { indexed, roles, controls } = pinState();
    expect(controls.filter((control) => control.name === "Save")).toHaveLength(1);
    const save = controls.find((control) => control.name === "Save")!;
    hidden.style.display = "";
    layOut();
    const live = liveHighlight({ text: "Save", role: "button", generation: 3, index: save.i, name: "Save" }, 3, indexed, roles);
    expect(live.result).toMatchObject({ found: false, reason: "stale" });
    expect(live.el).toBeUndefined();
  });

  it("refuses a target that was hidden after the read", () => {
    const { indexed, roles, controls } = pinState();
    const db = controls.find((control) => control.name === "Database ID")!;
    (document.getElementById("db") as HTMLElement).style.display = "none";
    const live = liveHighlight({ text: "Database ID", generation: 3, index: db.i, name: "Database ID" }, 3, indexed, roles);
    expect(live.result).toEqual({ found: false, reason: "stale", alternatives: [] });
    expect(live.el).toBeUndefined();
  });

  it("refuses a control whose role changed after the read", () => {
    const { indexed, roles, controls } = pinState();
    const db = controls.find((control) => control.name === "Database ID")!;
    (document.getElementById("db") as HTMLInputElement).type = "checkbox";
    const live = liveHighlight({ text: "Database ID", generation: 3, index: db.i, name: "Database ID" }, 3, indexed, roles);
    expect(live.result).toMatchObject({ found: false, reason: "stale" });
    expect(live.el).toBeUndefined();
  });

  it("keeps the fuzzy confidence of the original request", () => {
    document.body.innerHTML = `<label for="db">Database ID</label><input id="db">`;
    layOut();
    const { indexed, roles, controls } = pinState();
    const db = controls.find((control) => control.name === "Database ID")!;
    const live = liveHighlight({ text: "Database", generation: 3, index: db.i, name: "Database ID" }, 3, indexed, roles);
    expect(live.el).toBe(db.el);
    expect(live.result).toMatchObject({ found: true, i: db.i, name: "Database ID" });
    if (live.result.found) {
      expect(live.result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(live.result.confidence).toBeLessThan(1);
    }
  });
});
