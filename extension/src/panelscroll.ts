// The panel's one scrolling region: the conversation log with the guidance, Violation and draft cards below it.
const shown = (el: HTMLElement) => (el.hidden ? "" : el.textContent ?? "");

export class PanelScroll {
  // Cards changed while the person was typing, oldest first, each with its chip label.
  private pending = new Map<HTMLElement, () => string>();
  // The card a smooth reveal is moving to, until that scroll ends or the card is hidden or settled in view.
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
    scroll.addEventListener("scrollend", () => (this.revealing = null));
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
    if (this.revealing) this.revealing.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else if (following && grew > 0) this.scroll.scrollTop += grew;
  }

  // Re-renders a card and, when it is newly shown or its content changed, brings it into view.
  // While the person is typing, offers a chip above the composer instead of moving the page under them.
  update(card: HTMLElement, label: () => string, render: () => void) {
    const before = shown(card);
    render();
    const now = shown(card);
    if (!now) this.pending.delete(card);
    else if (now !== before) {
      if (document.activeElement === this.input && this.input.value.trim() !== "") this.pending.set(card, label);
      else this.reveal(card);
    }
    this.showChip();
  }

  reveal(el: HTMLElement) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.revealing = still ? null : el;
    el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
    this.pending.delete(el);
    this.showChip();
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
    this.chip.hidden = !label;
    if (label) this.chip.textContent = label();
  }
}
