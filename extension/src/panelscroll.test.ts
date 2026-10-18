// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PanelScroll } from "./panelscroll.ts";

// A tiny layout model: 100px viewport, 20px per log line, then two 100px cards (Violations, guidance) below the log.
const VIEW = 100;
const LINE = 20;
const CARD = 200;
let top = 0;
let scroll: HTMLElement, log: HTMLElement, issues: HTMLElement, guide: HTMLElement, input: HTMLInputElement, chip: HTMLButtonElement;
let panel: PanelScroll;
let reduced = false;
let viewBottom = VIEW;
let resized: () => void;

const logHeight = () => log.children.length * LINE;
const maxTop = () => Math.max(0, logHeight() + CARD - VIEW);
const cardTop = () => logHeight() - top;
const line = (text = "x") => () => log.append(Object.assign(document.createElement("p"), { textContent: text }));

beforeEach(() => {
  document.body.innerHTML = `
    <main id="scroll" tabindex="0"><div id="log"></div><ul id="issues" hidden></ul><section id="guidance" hidden></section></main>
    <button id="newcards" type="button" hidden></button>
    <input id="text">`;
  scroll = document.getElementById("scroll")!;
  log = document.getElementById("log")!;
  issues = document.getElementById("issues")!;
  guide = document.getElementById("guidance")!;
  input = document.getElementById("text") as HTMLInputElement;
  chip = document.getElementById("newcards") as HTMLButtonElement;
  top = 0;
  Object.defineProperty(scroll, "scrollTop", { get: () => top, set: (v: number) => { top = Math.min(Math.max(0, v), maxTop()); } });
  viewBottom = VIEW;
  scroll.getBoundingClientRect = () => ({ top: 0, bottom: viewBottom }) as DOMRect;
  log.getBoundingClientRect = () => ({ top: -top, bottom: logHeight() - top }) as DOMRect;
  issues.getBoundingClientRect = () => ({ top: logHeight() - top, bottom: logHeight() + 100 - top }) as DOMRect;
  guide.getBoundingClientRect = () => ({ top: logHeight() + 100 - top, bottom: logHeight() + 200 - top }) as DOMRect;
  issues.scrollIntoView = vi.fn();
  guide.scrollIntoView = vi.fn();
  reduced = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce") }));
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} });
  panel = new PanelScroll(scroll, log, input, chip);
  for (let i = 0; i < 10; i++) line()();
  scroll.scrollTop = logHeight() - VIEW;
});

const violate = (...messages: string[]) =>
  panel.update(issues, () => `New: ${messages.length} to fix`, () => {
    issues.hidden = messages.length === 0;
    issues.replaceChildren(...messages.map((m) => Object.assign(document.createElement("li"), { textContent: m })));
  });

const suggest = (...labels: string[]) =>
  panel.update(guide, () => "New: suggested labels", () => {
    guide.hidden = labels.length === 0;
    guide.textContent = labels.join(" ");
  });

const typing = () => {
  input.focus();
  input.value = "how do I";
};

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
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("how do I");
  });

  it("withdraws the chip when its card is cleared", () => {
    input.focus();
    input.value = "how do I";
    violate("Test mode lets anyone read your data");
    violate();
    expect(chip.hidden).toBe(true);
    expect(issues.scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps a Violation notice when guidance changes or clears while the person is typing", () => {
    typing();
    violate("Test mode lets anyone read your data");
    suggest("environment=dev");
    expect(chip.textContent).toBe("New: 1 to fix");
    suggest();
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("New: 1 to fix");

    chip.click();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(true);
  });

  it("walks the chip through every card changed while typing, oldest first", () => {
    typing();
    suggest("environment=dev");
    violate("Test mode lets anyone read your data");
    expect(chip.textContent).toBe("New: suggested labels");

    chip.focus();
    chip.click();
    expect(guide.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("New: 1 to fix");
    expect(document.activeElement).toBe(chip);

    chip.click();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("offers a chip without moving a person reading history, then focuses the revealed region", () => {
    scroll.scrollTop = 20;
    violate("Test mode lets anyone read your data");
    expect(top).toBe(20);
    expect(issues.scrollIntoView).not.toHaveBeenCalled();
    expect(chip.hidden).toBe(false);
    chip.focus();
    chip.click();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(true);
    expect(document.activeElement).toBe(scroll);
  });

  it("withdraws the chip once the person scrolls the card into view themselves", () => {
    scroll.scrollTop = 20;
    violate("Test mode lets anyone read your data");
    scroll.scrollTop = logHeight() - 50;
    scroll.dispatchEvent(new Event("scrollend"));
    expect(chip.hidden).toBe(false);

    scroll.scrollTop = logHeight();
    scroll.dispatchEvent(new Event("scrollend"));
    expect(chip.hidden).toBe(true);
    expect(issues.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("PanelScroll reveal while the coach streams", () => {
  it.each(["wheel", "touchmove", "pointerdown", "keydown"])("respects %s scroll intent during a reveal", (type) => {
    violate("Test mode lets anyone read your data");
    scroll.dispatchEvent(type === "keydown" ? new KeyboardEvent(type, { key: "PageUp" }) : new Event(type));
    scroll.scrollTop = 20;
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(top).toBe(20);
  });

  it("carries a smooth reveal on through streamed text instead of cutting it short", () => {
    scroll.scrollTop = logHeight() - VIEW;
    violate("Test mode lets anyone read your data");
    const at = top;
    panel.append(line());
    panel.append(line());
    expect(top).toBe(at);
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(3);
    expect(issues.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });

    scroll.scrollTop = logHeight();
    scroll.dispatchEvent(new Event("scrollend"));
    const cardAt = cardTop();
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(3);
    expect(cardTop()).toBe(cardAt);
  });

  it("does not re-reveal after an instant reveal under reduced motion", () => {
    reduced = true;
    issues.scrollIntoView = vi.fn(() => (scroll.scrollTop = logHeight()));
    scroll.scrollTop = logHeight() - VIEW;
    violate("Test mode lets anyone read your data");
    const at = top;
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(top).toBe(at + LINE);
  });

  it("lets go of a reveal that had nothing to move and follows the log again, without any scrollend", () => {
    scroll.scrollTop = logHeight();
    violate("Test mode lets anyone read your data");
    const cardAt = cardTop();
    panel.append(line());
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(cardTop()).toBe(cardAt);
  });

  it("lets go of a reveal whose card is cleared and follows the log again, without any scrollend", () => {
    scroll.scrollTop = logHeight() - VIEW;
    violate("Test mode lets anyone read your data");
    violate();
    const at = top;
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(top).toBe(at + LINE);
    expect(logHeight() - top).toBe(VIEW);
  });

  it("lets go of a reveal whose card leaves the page", () => {
    scroll.scrollTop = logHeight() - VIEW;
    violate("Test mode lets anyone read your data");
    issues.remove();
    const at = top;
    panel.append(line());
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(top).toBe(at + LINE);
  });

  it.each([false, true])("keeps the card in view when the viewport shrinks during a reveal (reduced motion: %s)", (still) => {
    reduced = still;
    scroll.scrollTop = logHeight() - VIEW;
    issues.scrollIntoView = vi.fn(() => (scroll.scrollTop = logHeight()));
    violate("Test mode lets anyone read your data");
    scroll.dispatchEvent(new Event("scrollend"));
    viewBottom = 70;
    log.getBoundingClientRect = () => ({ top: 30 - top, bottom: logHeight() + 30 - top }) as DOMRect;
    issues.getBoundingClientRect = () => ({ top: logHeight() + 30 - top, bottom: logHeight() + 130 - top }) as DOMRect;
    resized();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(issues.scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: still ? "auto" : "smooth" });
  });

  it("finishes a reveal cut short by layout when its scroll ends", () => {
    violate("Test mode lets anyone read your data");
    scroll.dispatchEvent(new Event("scrollend"));
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
    scroll.scrollTop = logHeight();
    scroll.dispatchEvent(new Event("scrollend"));
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("leaves the viewport alone on resize once the reader has taken over or the log has moved on", () => {
    violate("Test mode lets anyone read your data");
    scroll.dispatchEvent(new Event("wheel"));
    viewBottom = 70;
    resized();
    viewBottom = VIEW;
    violate("Test mode lets anyone read your data", "Pick a location");
    scroll.scrollTop = logHeight();
    scroll.dispatchEvent(new Event("scrollend"));
    panel.append(line());
    viewBottom = 70;
    resized();
    expect(issues.scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
