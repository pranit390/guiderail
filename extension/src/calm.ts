export type CalmPreset = "calm" | null;

export function parseCalmPreset(value: unknown): CalmPreset {
  if (value === "calm" || value === null) return value;
  throw new Error('Choose preset "calm" or null to restore.');
}

const STYLE_ID = "guiderail-customize";
const PREVIEW_MS = 5000;

// No page data, model text, or selectors are interpolated into this stylesheet.
const CALM_CSS = `
html.gr-calm { font-size: max(100%, 18px); scroll-behavior: auto !important; }
.gr-calm body { line-height: 1.65 !important; }
.gr-calm *, .gr-calm *::before, .gr-calm *::after {
  animation-duration: .01ms !important; animation-iteration-count: 1 !important;
  transition-duration: 0s !important; scroll-behavior: auto !important;
}
.gr-calm.gr-calm-sandbox :is(button, input, select, textarea, table, .muted, .crumb, .banner) {
  font-size: 1rem !important; line-height: 1.65 !important;
}
.gr-calm.gr-calm-sandbox :is(th, td) { padding-block: 16px !important; }
.gr-calm.gr-calm-sandbox th { font-size: .9rem !important; }
.gr-calm.gr-calm-sandbox :is(.label-row, .actions, .toolbar) { gap: 14px !important; }
.gr-calm.gr-calm-sandbox .label-row { margin-bottom: 16px !important; }
.gr-calm.gr-calm-sandbox #info-panel { padding-top: 24px !important; }
.gr-calm.gr-calm-sandbox header { background: #f3f4f6 !important; color: #424954 !important; }
.gr-calm.gr-calm-sandbox .crumb { color: #424954 !important; }
.gr-calm.gr-calm-sandbox .primary { background: #185abc !important; color: #fff !important; }
.gr-calm.gr-calm-sandbox input::placeholder { color: #5f6368 !important; opacity: 1 !important; }
`;

/** Owns presentation only. The existing overlay stays above the dimmer. */
export class CalmView {
  private style: HTMLStyleElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly shade = document.createElement("div");
  private readonly preview = document.createElement("div");
  private readonly addedClasses = new Set<string>();

  constructor(private readonly host: HTMLElement, layer: Element, private readonly announce: (text: string) => void) {
    this.shade.className = "gr-shade";
    this.shade.hidden = true;
    this.shade.setAttribute("aria-hidden", "true");
    layer.prepend(this.shade);
    this.preview.className = "gr-preview";
    this.preview.hidden = true;
    this.preview.setAttribute("role", "status");
    this.preview.innerHTML = `<span>Keep this look? Restores in 5 seconds.</span>
      <button type="button">Keep calmer</button><button type="button">Restore</button>`;
    const [keep, restore] = this.preview.querySelectorAll("button");
    keep.addEventListener("click", () => {
      clearTimeout(this.timer);
      this.preview.hidden = true;
      this.announce("Calmer view kept for this page. Restore is always available in the panel.");
    });
    restore.addEventListener("click", () => this.set(null));
    layer.append(this.preview);
  }

  get active(): boolean { return this.style !== null; }

  set(preset: CalmPreset) {
    if (preset === null) {
      this.restore();
      this.announce("Original page appearance restored.");
      return { ok: true, preset: null };
    }
    if (this.active) return { ok: true, preset, preview: !this.preview.hidden };
    this.style = document.createElement("style");
    this.style.id = STYLE_ID;
    this.style.textContent = CALM_CSS;
    document.documentElement.append(this.style);
    this.addClass("gr-calm");
    if (location.pathname.startsWith("/sandbox/") && document.querySelector('meta[name="guiderail-url"]')) {
      this.addClass("gr-calm-sandbox");
    }
    this.host.classList.add("gr-calm");
    this.preview.hidden = false;
    this.timer = setTimeout(() => this.set(null), PREVIEW_MS);
    this.announce("Calmer preview. Click Keep calmer on the page within 5 seconds, or it restores automatically.");
    return { ok: true, preset, preview: true };
  }

  private addClass(name: string) {
    if (document.documentElement.classList.contains(name)) return;
    this.addedClasses.add(name);
    document.documentElement.classList.add(name);
  }

  restore() {
    clearTimeout(this.timer);
    this.style?.remove();
    this.style = null;
    for (const name of this.addedClasses) document.documentElement.classList.remove(name);
    this.addedClasses.clear();
    this.host.classList.remove("gr-calm");
    this.preview.hidden = true;
    this.shade.hidden = true;
  }

  follow(step: Element | null, violations: Element[]) {
    this.shade.hidden = !this.active || !step?.isConnected || step.getClientRects().length === 0;
    if (this.shade.hidden || !step) return;
    // Keep the Step, flagged fields and keyboard focus bright, including overlapping regions.
    const focus = document.activeElement;
    const targets = [step, ...violations, ...(focus && focus !== document.body && focus !== this.host ? [focus] : [])]
      .filter((el) => el.isConnected && el.getClientRects().length > 0);
    const rects = targets.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)) - 8;
    const top = Math.min(...rects.map((r) => r.top)) - 8;
    const right = Math.max(...rects.map((r) => r.right)) + 8;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 8;
    Object.assign(this.shade.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
  }
}
