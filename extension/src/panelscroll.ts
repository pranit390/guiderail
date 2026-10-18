// The panel's one scrolling region: the conversation log with the guidance, Violation and draft cards below it.
const shown = (el: HTMLElement) => (el.hidden ? "" : el.textContent ?? "");

export class PanelScroll {
  // Cards changed while the person was typing or reading history, oldest first.
  private pending = new Map<HTMLElement, () => string>();
  // The card a reveal is bringing into view, until that scroll ends or the card is hidden or settled in view.
  private revealing: HTMLElement | null = null;

  constructor(
    private scroll: HTMLElement,
    private log: HTMLElement,
    private input: HTMLInputElement,
    private chip: HTMLButtonElement,
  ) {
    chip.addEventListener("click", () => {
      const [card] = this.pending.keys();
      if (card) this.reveal(card);
    });
    scroll.addEventListener("scrollend", () => {
      this.revealing = null;
      for (const card of this.pending.keys()) if (this.settled(card)) this.pending.delete(card);
      this.showChip();
    });
    // The header, status and chip can resize the viewport after a reveal starts; keep the card in view.
    new ResizeObserver(() => {
      if (this.revealing && !this.settled(this.revealing)) this.scrollTo(this.revealing);
    }).observe(scroll);
    const cancelReveal = () => (this.revealing = null);
    scroll.addEventListener("wheel", cancelReveal, { passive: true });
    scroll.addEventListener("touchmove", cancelReveal, { passive: true });
    scroll.addEventListener("pointerdown", cancelReveal);
    scroll.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelReveal();
    });
  }

  // Adds to the log. A reader at or below the end of the log keeps it where it was (following new text);
  // a reader scrolled back into the history is left alone. Never scrolls upward.
  // A smooth reveal still in progress is carried on rather than cut short.
  append(write: () => void) {
    if (this.revealing && this.settled(this.revealing)) this.revealing = null;
    const before = this.log.getBoundingClientRect().bottom;
    const following = before <= this.scroll.getBoundingClientRect().bottom + 1;
    write();
    const grew = this.log.getBoundingClientRect().bottom - before;
    if (this.revealing) this.scrollTo(this.revealing);
    else if (following && grew > 0) this.scroll.scrollTop += grew;
  }

  // Re-renders a card and, when it is newly shown or its content changed, brings it into view.
  // While the person is typing or reading history, offers a chip instead of moving the page under them.
  update(card: HTMLElement, label: () => string, render: () => void) {
    const before = shown(card);
    const readingHistory = this.log.getBoundingClientRect().bottom > this.scroll.getBoundingClientRect().bottom + 1;
    render();
    const now = shown(card);
    if (!now) this.pending.delete(card);
    else if (now !== before) {
      if (readingHistory || (document.activeElement === this.input && this.input.value.trim() !== "")) this.pending.set(card, label);
      else this.reveal(card);
    }
    this.showChip();
  }

  reveal(el: HTMLElement) {
    this.revealing = el;
    this.scrollTo(el);
    this.pending.delete(el);
    this.showChip();
  }

  private scrollTo(el: HTMLElement) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }

  private settled(el: HTMLElement) {
    if (el.hidden || !el.isConnected) return true;
    const card = el.getBoundingClientRect();
    const view = this.scroll.getBoundingClientRect();
    const inside = card.top >= view.top - 1 && card.bottom <= view.bottom + 1;
    const covers = card.top <= view.top + 1 && card.bottom >= view.bottom - 1;
    return inside || covers;
  }

  private showChip() {
    const [label] = this.pending.values();
    const restoreFocus = !label && document.activeElement === this.chip;
    this.chip.hidden = !label;
    if (label) this.chip.textContent = label();
    if (restoreFocus) (this.input.value ? this.input : this.scroll).focus({ preventScroll: true });
  }
}
