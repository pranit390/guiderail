/** The three guiding states. Stop is reserved for a blocking Rule. */
export const STATES = {
  go: { light: "#0f7a4a", dark: "#5fe0a8", label: "Here", glyph: "✓", shape: "circle", line: "solid" },
  check: { light: "#7a5c00", dark: "#ffd23f", label: "Check", glyph: "!", shape: "diamond", line: "dashed" },
  stop: { light: "#c5221f", dark: "#ff7a70", label: "Rule", glyph: "×", shape: "octagon", line: "solid" },
} as const;
export type GuidingState = keyof typeof STATES;
export const violationState = (severity: "warn" | "block"): GuidingState => severity === "block" ? "stop" : "check";

export function stateGlyph(state: GuidingState): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = `state-glyph ${state}`;
  el.setAttribute("aria-hidden", "true");
  const ink = document.createElement("span");
  ink.textContent = STATES[state].glyph;
  el.append(ink);
  return el;
}

export const GLYPH_CSS = `
.state-glyph { display:inline-flex; width:16px; height:16px; align-items:center; justify-content:center; flex-shrink:0; font:700 12px/1 system-ui; vertical-align:middle; margin-right:6px; }
.state-glyph.go { border:1.5px solid currentColor; border-radius:50%; }
.state-glyph.check { border:1.5px dashed currentColor; transform:rotate(45deg); width:14px; height:14px; margin-inline:2px 8px; }
.state-glyph.check > span { transform:rotate(-45deg); }
.state-glyph.stop { background:currentColor; clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%); }
.state-glyph.stop > span { color:var(--gr-on-stop,#fff); }
`;
