// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import seed from "../../seed/rules/org-labeling-rules.json";
import type { FormState, PageSnapshot, ToPage } from "./messages.ts";
import { evaluate, type Rule } from "./policy.ts";

const rules = seed.rules as Rule[];
const runtime = { id: "test-extension", sendMessage: vi.fn().mockResolvedValue({}), onMessage: { addListener: vi.fn() } };

function request(msg: ToPage | { kind: "customize"; preset: unknown }): unknown {
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const reply = vi.fn();
  listener(msg, {}, reply);
  return reply.mock.calls[0][0];
}

// The side panel always pins a highlight to the latest read; an unpinned one is refused.
function highlightPinned(text: string, role: string): unknown {
  const snap = request({ kind: "read_page" }) as PageSnapshot;
  const el = snap.elements.find((e) => e.role === role && e.name === text)!;
  return request({ kind: "highlight", text, role, generation: snap.generation, index: el.i, name: el.name });
}

function form(): FormState {
  return request({ kind: "read_form" }) as FormState;
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  runtime.id = "test-extension";
  runtime.onMessage.addListener.mockClear();
  vi.stubGlobal("chrome", { runtime });
  document.head.innerHTML = '<meta name="guiderail-url" content="console.cloud.google.com/run"><style>* { opacity: 1; }</style>';
  document.body.innerHTML = `<section aria-label="Labels"><h2>Labels</h2>
    <input aria-label="Key 1" value="environment"><input aria-label="Value 1" value="production">
    </section><button>Create</button>`;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 100, 200, 60));
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([new DOMRect(40, 100, 200, 60)] as unknown as DOMRectList);
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  await import("./content.ts");
});

afterEach(() => {
  runtime.id = "";
  vi.advanceTimersByTime(20);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("calmer content messages", () => {
  it("places the pointer inside a wizard top layer and returns it to the page", () => {
    const surface = document.createElement("div");
    surface.setAttribute("popover", "manual");
    surface.innerHTML = '<button>Standard edition</button>';
    document.body.append(surface);
    expect(highlightPinned("Standard edition", "button")).toMatchObject({ found: true });
    expect(surface.querySelector("guiderail-overlay")).not.toBeNull();
    expect(highlightPinned("Create", "button")).toMatchObject({ found: true });
    expect(document.documentElement.querySelector(":scope > guiderail-overlay")).not.toBeNull();
    const snap = request({ kind: "read_page" }) as PageSnapshot;
    expect(request({ kind: "highlight", text: "Gone", generation: snap.generation, index: snap.elements.length + 1, name: "Gone" })).toMatchObject({ found: false });
    expect(document.querySelector("guiderail-overlay")?.shadowRoot?.querySelector<HTMLElement>(".ring")?.hidden).toBe(true);
  });
  it("refuses a renamed or duplicated pinned Journey target", () => {
    document.body.innerHTML = '<button>Create</button>';
    const read = request({ kind: "read_page" }) as PageSnapshot;
    const create = read.elements.find((e) => e.name === "Create")!;
    document.querySelector("button")!.textContent = "Create database";
    expect(request({ kind: "highlight", text: "Create", generation: read.generation, index: create.i, name: "Create" })).toMatchObject({ found: false });
    document.body.innerHTML = '<button>Next</button><button>Next</button>';
    const twins = request({ kind: "read_page" }) as PageSnapshot;
    const next = twins.elements.find((e) => e.name === "Next")!;
    expect(request({ kind: "highlight", text: "Next", generation: twins.generation, index: next.i, name: "Next" })).toMatchObject({ found: false });
    expect(document.querySelector("guiderail-overlay")?.shadowRoot?.querySelector<HTMLElement>(".ring")?.hidden).toBe(true);
  });
  it("reads a transparent native radio with a visible painted label, but not a hidden wizard choice", () => {
    document.body.insertAdjacentHTML("beforeend", '<label for="edition">Standard edition<input id="edition" type="radio" style="opacity:0" checked></label><label for="mode" style="visibility:hidden">Production mode<input id="mode" type="radio" style="opacity:0;visibility:hidden"></label>');
    const snapshot = request({ kind: "read_page" });
    expect(snapshot).toMatchObject({ elements: expect.arrayContaining([expect.objectContaining({ role: "radio", name: "Standard edition", value: "checked" })]) });
    expect(snapshot).not.toMatchObject({ elements: expect.arrayContaining([expect.objectContaining({ name: "Production mode" })]) });
    expect(highlightPinned("Standard edition", "radio")).toMatchObject({ found: true });
    expect(document.querySelector<HTMLInputElement>("#edition")!.checked).toBe(true);
  });
  it("reads and highlights a visible ARIA radio without selecting it", () => {
    const radio = document.createElement("div");
    radio.setAttribute("role", "radio"); radio.setAttribute("aria-label", "Standard edition"); radio.setAttribute("aria-checked", "true");
    document.body.append(radio); const clicked = vi.fn(); radio.addEventListener("click", clicked);
    expect(request({ kind: "read_page" })).toMatchObject({ elements: expect.arrayContaining([{ i: expect.any(Number), role: "radio", name: "Standard edition", value: "checked" }]) });
    expect(highlightPinned("Standard edition", "radio")).toMatchObject({ found: true, name: "Standard edition" });
    expect(clicked).not.toHaveBeenCalled(); expect(radio.getAttribute("aria-checked")).toBe("true");
  });
  it("rejects a stale bound URL before reading or highlighting", () => {
    expect(request({ kind: "read_page", expectedUrl: "https://accounts.google.com/" })).toHaveProperty("error");
    expect(request({ kind: "highlight", text: "Create", expectedUrl: "https://accounts.google.com/" })).toHaveProperty("error");
    expect(request({ kind: "read_page", expectedUrl: location.href })).toHaveProperty("elements");
  });
  it("rejects arbitrary presets at the page boundary", () => {
    expect(request({ kind: "customize", preset: "body { display: none }" })).toHaveProperty("error");
    expect(document.querySelector("#guiderail-customize")).toBeNull();
  });

  it("keeps the real form reader and policy results unchanged, with violations above the spotlight", () => {
    const before = form();
    const violations = evaluate(rules, before);
    expect(violations.length).toBeGreaterThan(0);
    expect(highlightPinned("Labels", "heading")).toMatchObject({ found: true });
    request({ kind: "customize", preset: "calm" });
    request({ kind: "show_violations", violations });
    vi.advanceTimersByTime(20);
    expect(form()).toEqual(before);
    expect(evaluate(rules, form())).toEqual(violations);
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    const shade = shadow.querySelector<HTMLElement>(".gr-shade")!;
    expect(shade.hidden).toBe(false);
    // Exact-field marking: only environment has a value input on this page; missing keys mark nothing, and Save is never boxed.
    expect(shadow.querySelectorAll(".bad")).toHaveLength(1);
    expect(shade.parentElement?.firstElementChild).toBe(shade);
    expect(shadow.querySelector<HTMLElement>(".ring")?.hidden).toBe(false);
    request({ kind: "customize", preset: null });
    expect(shade.hidden).toBe(true);
    expect(form()).toEqual(before);
    expect(evaluate(rules, form())).toEqual(violations);
    expect(shadow.querySelectorAll(".bad")).toHaveLength(1);
  });

  it("clears the spotlight when a Step finishes without turning off the kept preset", () => {
    request({ kind: "customize", preset: "calm" });
    highlightPinned("Labels", "heading");
    request({ kind: "clear" });
    vi.advanceTimersByTime(20);
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    expect(shadow.querySelector<HTMLElement>(".gr-shade")?.hidden).toBe(true);
    expect(document.querySelector("#guiderail-customize")).not.toBeNull();
  });

  it("restores when the extension context goes away", () => {
    request({ kind: "customize", preset: "calm" });
    runtime.id = "";
    vi.advanceTimersByTime(20);
    expect(document.querySelector("#guiderail-customize")).toBeNull();
    expect(document.querySelector("guiderail-overlay")).toBeNull();
  });

  it("lets a submit through once the extension context is gone, even with blocking Violations", () => {
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    runtime.id = "";
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("button")!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(document.querySelector("guiderail-overlay")).toBeNull();
  });

  it("themes the Step ring and each Violation box from their own surroundings", () => {
    document.querySelector<HTMLElement>('section[aria-label="Labels"]')!.style.backgroundColor = "rgb(22, 29, 40)";
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    expect(highlightPinned("Create", "button")).toMatchObject({ found: true });
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    expect(shadow.querySelector<HTMLElement>(".ring")!.dataset.theme).toBe("light");
    expect(shadow.querySelector<HTMLElement>(".bad")!.dataset.theme).toBe("dark");
  });

  it("hides a Violation's Rule chip once its field scrolls out of view, and shows it again on return", () => {
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    const chip = shadow.querySelector<HTMLElement>(".chip:not(.step-chip)")!;
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(false);
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(40, -400, 200, 60));
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(true);
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(40, 100, 200, 60));
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(false);
  });

  it("places a Rule chip beside its field, then below, and never over another form control", () => {
    const value = document.querySelector('[aria-label="Value 1"]')!;
    const blockers: Record<string, DOMRect> = {};
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      return blockers[this.getAttribute("aria-label") ?? ""] ?? new DOMRect(40, 100, 200, 60);
    });
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    const chip = document.querySelector("guiderail-overlay")!.shadowRoot!.querySelector<HTMLElement>(".chip:not(.step-chip)")!;
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(false);
    expect(chip.style.left).toBe("248px");
    expect(parseFloat(chip.style.top)).toBeCloseTo(100 + (60 - chip.offsetHeight) / 2);

    const right = document.createElement("input");
    right.setAttribute("aria-label", "Right");
    value.after(right);
    blockers.Right = new DOMRect(244, 100, 200, 60);
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(false);
    expect(chip.style.top).toBe("166px");

    const under = document.createElement("input");
    under.setAttribute("aria-label", "Under");
    right.after(under);
    blockers.Under = new DOMRect(40, 162, 400, 60);
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(true);
    (value as HTMLInputElement).focus();
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(false);
    expect(parseFloat(chip.style.top)).toBeCloseTo(94 - chip.offsetHeight);

    const over = document.createElement("input");
    over.setAttribute("aria-label", "Over");
    under.after(over);
    blockers.Over = new DOMRect(40, 40, 400, 60);
    vi.advanceTimersByTime(20);
    expect(chip.hidden).toBe(true);
  });

  it("narrows a Rule chip to the room beside its field so it can sit there", () => {
    vi.stubGlobal("innerWidth", 520);
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(40, 100, 280, 60));
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    const chip = document.querySelector("guiderail-overlay")!.shadowRoot!.querySelector<HTMLElement>(".chip:not(.step-chip)")!;
    vi.advanceTimersByTime(20);
    expect(chip.style.maxWidth).toBe("174px");
    expect(chip.style.left).toBe("328px");
  });
});


describe("Rule state mapping", () => {
  it("uses dashed Check for warnings and Stop only when the same field has a blocker", () => {
    request({ kind:"show_violations", violations:[{ field:"label:environment", severity:"warn", message:"Confirm the environment." }] });
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    expect(shadow.querySelector(".bad.check")).not.toBeNull();
    expect(shadow.querySelector(".bad.stop")).toBeNull();
    expect(shadow.querySelector(".chip:not(.step-chip)")!.textContent).toContain("Check ·");
    request({ kind:"show_violations", violations:[
      { field:"label:environment", severity:"warn", message:"Confirm the environment." },
      { field:"label:environment", severity:"block", message:"Production is blocked." },
    ] });
    expect(shadow.querySelectorAll(".bad")).toHaveLength(1);
    expect(shadow.querySelector(".bad.stop")).not.toBeNull();
    expect(shadow.querySelector(".chip:not(.step-chip)")!.textContent).toContain("Rule ·");
    expect(shadow.querySelector(".chip:not(.step-chip) .state-glyph.stop")).not.toBeNull();
  });
});

describe("highlight freshness", () => {
  function ring() {
    return document.querySelector("guiderail-overlay")!.shadowRoot!.querySelector<HTMLElement>(".ring")!;
  }

  function layOut(root: ParentNode = document) {
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      if (el.style.display === "none") continue;
      el.getBoundingClientRect = () => new DOMRect(40, 100, 200, 60);
    }
  }

  beforeEach(() => {
    document.body.innerHTML = `<section aria-label="Labels"><h2>Labels</h2>
      <input aria-label="Key 1" value="environment"><input aria-label="Value 1" value="production">
      </section><section aria-label="Billing"><button type="button">Save</button></section>
      <label for="db">Database ID</label><input id="db">`;
    layOut();
  });

  it("hides the ring when a second Save appears after a successful highlight", () => {
    const snap = request({ kind: "read_page" }) as PageSnapshot;
    const db = snap.elements.find((el) => el.name === "Database ID")!;
    expect(request({ kind: "highlight", text: "Database ID", generation: snap.generation, index: db.i, name: db.name })).toMatchObject({ found: true });
    expect(ring().hidden).toBe(false);

    document.querySelector("section")!.insertAdjacentHTML("beforeend", `<button type="button">Save</button>`);
    layOut();
    const save = snap.elements.find((el) => el.name === "Save")!;
    expect(request({ kind: "highlight", text: "Save", role: "button", generation: snap.generation, index: save.i, name: "Save" })).toMatchObject({ found: false, reason: "stale" });
    expect(ring().hidden).toBe(true);
  });

  it("hides the ring when the pinned target is no longer visible, and keeps Violation marks", () => {
    const snap = request({ kind: "read_page" }) as PageSnapshot;
    const db = snap.elements.find((el) => el.name === "Database ID")!;
    request({ kind: "show_violations", violations: evaluate(rules, form()) });
    expect(request({ kind: "highlight", text: "Database ID", generation: snap.generation, index: db.i, name: db.name })).toMatchObject({ found: true });
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    expect(shadow.querySelectorAll(".bad").length).toBeGreaterThan(0);

    (document.getElementById("db") as HTMLElement).style.display = "none";
    expect(request({ kind: "highlight", text: "Database ID", generation: snap.generation, index: db.i, name: db.name })).toMatchObject({ found: false, reason: "stale" });
    expect(ring().hidden).toBe(true);
    expect(shadow.querySelectorAll(".bad").length).toBeGreaterThan(0);
  });

  it("hides the ring when the page moves, without waiting for the next highlight", () => {
    const snap = request({ kind: "read_page" }) as PageSnapshot;
    const db = snap.elements.find((el) => el.name === "Database ID")!;
    expect(request({ kind: "highlight", text: "Database ID", generation: snap.generation, index: db.i, name: db.name })).toMatchObject({ found: true });
    history.pushState(null, "", "/moved");
    vi.advanceTimersByTime(500);
    expect(ring().hidden).toBe(true);
    expect(request({ kind: "highlight", text: "Database ID", generation: snap.generation, index: db.i, name: db.name })).toMatchObject({ found: false, reason: "stale" });
  });
});
