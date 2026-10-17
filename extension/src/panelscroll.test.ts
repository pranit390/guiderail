// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PanelScroll } from "./panelscroll.ts";

// A tiny layout model: 100px viewport, 20px per log line, a 200px card below the log.
const VIEW = 100;
const LINE = 20;
const CARD = 200;
let top = 0;
let scroll: HTMLElement, log: HTMLElement, issues: HTMLElement, input: HTMLInputElement, chip: HTMLButtonElement;
let panel: PanelScroll;
let reduced = false;

const logHeight = () => log.children.length * LINE;
const maxTop = () => Math.max(0, logHeight() + CARD - VIEW);
const cardTop = () => logHeight() - top;
const line = (text = "x") => () => log.append(Object.assign(document.createElement("p"), { textContent: text }));

beforeEach(() => {
  document.body.innerHTML = `
    <main id="scroll"><div id="log"></div><ul id="issues" hidden></ul></main>
    <button id="newcards" type="button" hidden></button>
    <input id="text">`;
  scroll = document.getElementById("scroll")!;
  log = document.getElementById("log")!;
  issues = document.getElementById("issues")!;
  input = document.getElementById("text") as HTMLInputElement;
  chip = document.getElementById("newcards") as HTMLButtonElement;
  top = 0;
  Object.defineProperty(scroll, "scrollTop", { get: () => top, set: (v: number) => { top = Math.min(Math.max(0, v), maxTop()); } });
  scroll.getBoundingClientRect = () => ({ top: 0, bottom: VIEW }) as DOMRect;
  log.getBoundingClientRect = () => ({ top: -top, bottom: logHeight() - top }) as DOMRect;
  issues.scrollIntoView = vi.fn();
  reduced = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce") }));
  panel = new PanelScroll(scroll, log, input, chip);
  for (let i = 0; i < 10; i++) line()();
});

const violate = (...messages: string[]) =>
  panel.update(issues, () => `New: ${messages.length} to fix`, () => {
    issues.hidden = messages.length === 0;
    issues.replaceChildren(...messages.map((m) => Object.assign(document.createElement("li"), { textContent: m })));
  });

describe("PanelScroll.append", () => {
  it("follows new text when the reader is at the end of the log", () => {
    scroll.scrollTop = logHeight() - VIEW;
    panel.append(line());
    expect(logHeight() - top).toBe(VIEW);
  });

  it("keeps the cards below the log in place while the coach streams, never scrolling upward", () => {
    scroll.scrollTop = maxTop();
    const cardAt = cardTop();
    for (let i = 0; i < 5; i++) {
      const was = top;
      panel.append(line());
      expect(top).toBeGreaterThanOrEqual(was);
      expect(cardTop()).toBe(cardAt);
    }
  });

  it("leaves a reader scrolled back into the history where they are", () => {
    scroll.scrollTop = 20;
    panel.append(line());
    panel.append(line());
    expect(top).toBe(20);
  });
});

describe("PanelScroll.update", () => {
  it("scrolls a newly shown or changed card into view, smoothly", () => {
    violate("Test mode lets anyone read your data");
    expect(issues.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });
    violate("Test mode lets anyone read your data");
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    violate("Test mode lets anyone read your data", "Pick a location");
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
    violate();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("jumps instantly under prefers-reduced-motion", () => {
    reduced = true;
    violate("Test mode lets anyone read your data");
    expect(issues.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "auto" });
  });

  it("offers a chip instead of scrolling while the person is typing, and the chip reveals the card", () => {
    input.focus();
    input.value = "how do I";
    violate("Test mode lets anyone read your data");
    expect(issues.scrollIntoView).not.toHaveBeenCalled();
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("New: 1 to fix");

    violate("Test mode lets anyone read your data", "Pick a location");
    expect(chip.textContent).toBe("New: 2 to fix");

    chip.focus();
    chip.click();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(true);
  });

  it("withdraws the chip when its card is cleared", () => {
    input.focus();
    input.value = "how do I";
    violate("Test mode lets anyone read your data");
    violate();
    expect(chip.hidden).toBe(true);
    expect(issues.scrollIntoView).not.toHaveBeenCalled();
  });
});
