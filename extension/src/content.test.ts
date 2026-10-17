// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import seed from "../../seed/rules/org-labeling-rules.json";
import type { FormState, ToPage } from "./messages.ts";
import { evaluate, type Rule } from "./policy.ts";

const rules = seed.rules as Rule[];
const runtime = { id: "test-extension", sendMessage: vi.fn().mockResolvedValue({}), onMessage: { addListener: vi.fn() } };

function request(msg: ToPage | { kind: "customize"; preset: unknown }): unknown {
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const reply = vi.fn();
  listener(msg, {}, reply);
  return reply.mock.calls[0][0];
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
  it("rejects arbitrary presets at the page boundary", () => {
    expect(request({ kind: "customize", preset: "body { display: none }" })).toHaveProperty("error");
    expect(document.querySelector("#guiderail-customize")).toBeNull();
  });

  it("keeps the real form reader and policy results unchanged, with violations above the spotlight", () => {
    const before = form();
    const violations = evaluate(rules, before);
    expect(violations.length).toBeGreaterThan(0);
    expect(request({ kind: "highlight", text: "Labels", role: "heading" })).toMatchObject({ found: true });
    request({ kind: "customize", preset: "calm" });
    request({ kind: "show_violations", fields: violations.map((v) => v.field), submitLabel: "Create" });
    vi.advanceTimersByTime(20);
    expect(form()).toEqual(before);
    expect(evaluate(rules, form())).toEqual(violations);
    const shadow = document.querySelector("guiderail-overlay")!.shadowRoot!;
    const shade = shadow.querySelector<HTMLElement>(".gr-shade")!;
    expect(shade.hidden).toBe(false);
    expect(shadow.querySelectorAll(".bad")).toHaveLength(2);
    expect(shade.parentElement?.firstElementChild).toBe(shade);
    expect(shadow.querySelector<HTMLElement>(".ring")?.hidden).toBe(false);
    request({ kind: "customize", preset: null });
    expect(shade.hidden).toBe(true);
    expect(form()).toEqual(before);
    expect(evaluate(rules, form())).toEqual(violations);
    expect(shadow.querySelectorAll(".bad")).toHaveLength(2);
  });

  it("clears the spotlight when a Step finishes without turning off the kept preset", () => {
    request({ kind: "customize", preset: "calm" });
    request({ kind: "highlight", text: "Labels", role: "heading" });
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
});
