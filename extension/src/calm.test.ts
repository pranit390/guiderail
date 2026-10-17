// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalmView, parseCalmPreset } from "./calm.ts";

let view: CalmView;
let host: HTMLElement;
let layer: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<label for="name">Name</label><input id="name" required value="kept"><button>Save</button>';
  host = document.createElement("guiderail-overlay");
  layer = document.createElement("div");
  host.attachShadow({ mode: "open" }).append(layer);
  document.body.append(host);
  view = new CalmView(host, layer, vi.fn());
});

afterEach(() => {
  view.restore();
  vi.useRealTimers();
});

describe("calmer presentation", () => {
  it.each([undefined, "dark", "null", "body{display:none}", {}, 1, true])("rejects unsupported preset %s", (value) => {
    expect(() => parseCalmPreset(value)).toThrow();
    expect(view.active).toBe(false);
  });

  it("applies once and restores without touching page markup, values or inline styles", () => {
    const before = document.body.innerHTML;
    view.set(parseCalmPreset("calm"));
    view.set("calm");
    expect(document.querySelectorAll("#guiderail-customize")).toHaveLength(1);
    expect(document.documentElement.classList.contains("gr-calm")).toBe(true);
    expect(document.querySelector("input")?.value).toBe("kept");
    expect(document.querySelector("input")?.required).toBe(true);
    view.set(parseCalmPreset(null));
    expect(document.querySelector("#guiderail-customize")).toBeNull();
    expect(document.documentElement.classList.contains("gr-calm")).toBe(false);
    expect(document.body.innerHTML).toBe(before.replace("<guiderail-overlay>", '<guiderail-overlay class="">'));
  });

  it("stays applied until restored, with no timer or on-page prompt", () => {
    view.set("calm");
    vi.advanceTimersByTime(60_000);
    expect(view.active).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(layer.querySelectorAll("button")).toHaveLength(0);
    view.set(null);
    expect(view.active).toBe(false);
  });
});
