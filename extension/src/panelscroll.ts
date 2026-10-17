// The panel's one scrolling region: the conversation log with the guidance, Violation and draft cards below it.
const shown = (el: HTMLElement) => (el.hidden ? "" : el.textContent ?? "");

export class PanelScroll {
  private pending: HTMLElement | null = null;

  constructor(
    private scroll: HTMLElement,
    private log: HTMLElement,
    private input: HTMLInputElement,
    private chip: HTMLButtonElement,
  ) {
    chip.addEventListener("click", () => this.pending && this.reveal(this.pending));
  }

  // Adds to the log. A reader at or below the end of the log keeps it where it was (following new text);
  // a reader scrolled back into the history is left alone. Never scrolls upward.
  append(write: () => void) {
    const before = this.log.getBoundingClientRect().bottom;
    const following = before <= this.scroll.getBoundingClientRect().bottom + 1;
    write();
    const grew = this.log.getBoundingClientRect().bottom - before;
    if (following && grew > 0) this.scroll.scrollTop += grew;
  }

  // Re-renders a card and, when it is newly shown or its content changed, brings it into view.
  // While the person is typing, offers a chip above the composer instead of moving the page under them.
  update(card: HTMLElement, label: () => string, render: () => void) {
    const before = shown(card);
    render();
    const now = shown(card);
    if (this.pending === card) {
      if (!now) this.clearChip();
      else this.chip.textContent = label();
    }
    if (!now || now === before) return;
    if (document.activeElement === this.input && this.input.value.trim() !== "") {
      this.pending = card;
      this.chip.textContent = label();
      this.chip.hidden = false;
    } else this.reveal(card);
  }

  reveal(el: HTMLElement) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
    if (this.pending === el) this.clearChip();
  }

  private clearChip() {
    this.pending = null;
    this.chip.hidden = true;
  }
}
