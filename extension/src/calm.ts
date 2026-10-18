import { highlightRegion, padded } from "./highlight-layout.ts";

export type CalmPreset = "calm" | null;

export function parseCalmPreset(value: unknown): CalmPreset {
  if (value === "calm" || value === null) return value;
  throw new Error('Choose preset "calm" or null to restore.');
}

const STYLE_ID = "guiderail-customize";

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
  private readonly shade = document.createElement("div");
  private readonly addedClasses = new Set<string>();

  constructor(private readonly host: HTMLElement, layer: Element, private readonly announce: (text: string) => void) {
    this.shade.className = "gr-shade";
    this.shade.hidden = true;
    this.shade.setAttribute("aria-hidden", "true");
    layer.prepend(this.shade);
  }

  get active(): boolean { return this.style !== null; }

  set(preset: CalmPreset) {
    if (preset === null) {
      this.restore();
      this.announce("Original page appearance restored.");
      return { ok: true, preset: null };
    }
    if (this.active) return { ok: true, preset };
    this.style = document.createElement("style");
    this.style.id = STYLE_ID;
    this.style.textContent = CALM_CSS;
    document.documentElement.append(this.style);
    this.addClass("gr-calm");
    if (location.pathname.startsWith("/sandbox/") && document.querySelector('meta[name="guiderail-url"]')) {
      this.addClass("gr-calm-sandbox");
    }
    this.host.classList.add("gr-calm");
    this.announce("Calmer view on for this page. Say put it back or click Restore in the panel to undo.");
    return { ok: true, preset };
  }

  private addClass(name: string) {
    if (document.documentElement.classList.contains(name)) return;
    this.addedClasses.add(name);
    document.documentElement.classList.add(name);
  }

  restore() {
    this.style?.remove();
    this.style = null;
    for (const name of this.addedClasses) document.documentElement.classList.remove(name);
    this.addedClasses.clear();
    this.host.classList.remove("gr-calm");
    this.shade.hidden = true;
  }

  follow(step: Element | null) {
    this.shade.hidden = !this.active || !step?.isConnected || step.getClientRects().length === 0;
    if (this.shade.hidden || !step) return;
    const { rect, radius } = highlightRegion(step);
    // One soft cutout follows only the semantic target. Distant focus/Rules must
    // not punch a large rectangular corridor through the rest of the dimmer.
    const hole = padded(rect, 8);
    Object.assign(this.shade.style, { left: `${hole.left}px`, top: `${hole.top}px`, width: `${hole.width}px`, height: `${hole.height}px`, borderRadius: `${radius + 8}px` });
  }
}
