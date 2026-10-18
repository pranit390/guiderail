// Resolves a Step's control against the latest page read.
// Exact normalized accessible names win. A tie asks the person. Nothing below the
// existing 0.6 confidence is a match. A stale read or another tab cannot authorize
// a highlight or an Assist fill.
import type { HighlightResult, PageElement } from "./messages.ts";
import { collectControls, nameOf, norm, roleOf } from "./page.ts";

export const MIN_CONFIDENCE = 0.6;

export type BoundSnapshot = {
  tabId: number;
  url: string;
  generation: number;
  elements: PageElement[];
};

type Refusal = Extract<HighlightResult, { found: false }>;

export type TargetDecision =
  | { authorized: true; i: number; name: string; confidence: number }
  | ({ authorized: false } & Refusal);

type Ranked = { e: PageElement; s: number };

// Highlight and Assist fill may proceed only when this is true.
export function actionAuthorized(decision: TargetDecision): decision is Extract<TargetDecision, { authorized: true }> {
  return decision.authorized;
}

export function scoreName(target: string, name: string): number {
  const t = norm(target), n = norm(name);
  if (!t || !n) return 0;
  if (t === n) return 1;
  if (n.startsWith(t) || t.startsWith(n)) return 0.85;
  if (n.includes(t) || t.includes(n)) return 0.7;
  const tw = new Set(t.split(" ")), nw = new Set(n.split(" "));
  const shared = [...tw].filter((w) => nw.has(w)).length;
  return (shared / Math.max(tw.size, nw.size)) * 0.6;
}

function labelOf(e: PageElement): string {
  return e.section ? `${e.section}: ${e.name}` : e.name;
}

function rank(elements: PageElement[], text: string, role: string | undefined, exact: boolean): Ranked[] {
  return elements
    .map((e) => ({ e, s: (exact ? 1 : scoreName(text, e.name)) + (role && e.role === role ? 0.05 : 0) }))
    .sort((a, b) => b.s - a.s || a.e.i - b.e.i);
}

function tied(ranked: Ranked[]): Ranked[] {
  const best = ranked[0]?.s ?? 0;
  const key = Math.round(best * 100);
  return ranked.filter((r) => Math.round(r.s * 100) === key);
}

export function ambiguousAsk(text: string, alternatives: string[]): string {
  const list = alternatives.length === 2
    ? `${alternatives[0]} or ${alternatives[1]}`
    : `${alternatives.slice(0, -1).join(", ")}, or ${alternatives[alternatives.length - 1]}`;
  return `Which "${text.trim()}" should I point at? I see ${list}.`;
}

export function mismatchLine(control: string, citation?: string): string {
  const name = control.trim() || "that control";
  const screen = `I can't see ${name} on this screen.`;
  return citation?.trim() ? `The doc says ${citation.trim()}. ${screen}` : screen;
}

export type NameResolution =
  | { status: "found"; i: number; name: string; confidence: number }
  | { status: "ambiguous"; alternatives: string[] }
  | { status: "missing"; alternatives: string[] };

// Exact normalized names first, then an exact "Section: Name" label. Fuzzy candidates are only
// considered when neither exists. A section keeps only the controls inside that labelled region.
export function resolveName(text: string, elements: PageElement[], role?: string, section?: string): NameResolution {
  const query = norm(text);
  if (!query) return { status: "missing", alternatives: [] };
  const area = norm(section ?? "");
  if (area) elements = elements.filter((e) => e.section !== undefined && norm(e.section) === area);
  const named = elements.filter((e) => norm(e.name) === query);
  const exact = named.length ? named : elements.filter((e) => e.section !== undefined && norm(labelOf(e)) === query);
  if (exact.length) {
    const winners = tied(rank(exact, text, role, true));
    if (winners.length > 1) return { status: "ambiguous", alternatives: winners.map((r) => labelOf(r.e)) };
    return { status: "found", i: winners[0].e.i, name: winners[0].e.name, confidence: 1 };
  }
  const ranked = rank(elements, text, role, false);
  const best = ranked[0];
  if (!best || best.s < MIN_CONFIDENCE) {
    return { status: "missing", alternatives: ranked.filter((r) => r.s > 0).slice(0, 5).map((r) => labelOf(r.e)) };
  }
  const winners = tied(ranked.filter((r) => r.s >= MIN_CONFIDENCE));
  if (winners.length > 1) return { status: "ambiguous", alternatives: winners.map((r) => labelOf(r.e)) };
  return { status: "found", i: best.e.i, name: best.e.name, confidence: best.s };
}

export function authorizeTarget(input: {
  text: string;
  role?: string;
  section?: string;
  citation?: string;
  snapshot: BoundSnapshot | null;
  stale: boolean;
  tabId: number | null;
}): TargetDecision {
  const { snapshot, tabId } = input;
  if (!snapshot || tabId == null) return { authorized: false, found: false, reason: "unbound", alternatives: [] };
  if (tabId !== snapshot.tabId) return { authorized: false, found: false, reason: "wrong_tab", alternatives: [] };
  if (input.stale) return { authorized: false, found: false, reason: "stale", alternatives: [] };
  const result = resolutionResult(input.text, resolveName(input.text, snapshot.elements, input.role, input.section), input.citation);
  if (result.found) return { authorized: true, i: result.i, name: result.name, confidence: result.confidence };
  return { authorized: false, ...result };
}

export function resolutionResult(text: string, resolved: NameResolution, citation?: string): HighlightResult {
  if (resolved.status === "found") return { found: true, i: resolved.i, name: resolved.name, confidence: resolved.confidence };
  if (resolved.status === "ambiguous") {
    return { found: false, reason: "ambiguous", alternatives: resolved.alternatives, ask: ambiguousAsk(text, resolved.alternatives) };
  }
  const cite = citation?.trim() || undefined;
  return { found: false, reason: "missing", alternatives: resolved.alternatives, citation: cite, mismatch: mismatchLine(text, cite) };
}

export function highlightResult(decision: TargetDecision): HighlightResult {
  if (decision.authorized) return { found: true, i: decision.i, name: decision.name, confidence: decision.confidence };
  const { authorized: _, ...refusal } = decision;
  return refusal;
}

export function highlightOutcome(decision: Refusal): string {
  if (decision.reason === "ambiguous") return decision.ask;
  if (decision.reason === "missing") return decision.mismatch;
  if (decision.reason === "stale") return "This screen changed since I last read it, so I won't point at or fill anything.";
  if (decision.reason === "wrong_tab") return "That screen is a different tab from the one I last read, so I won't point at or fill anything.";
  return "I haven't read this screen yet, so I won't point at or fill anything.";
}

function pageElementsOf(controls: ReturnType<typeof collectControls>): PageElement[] {
  return controls.map(({ i, role, name, value, section }) => {
    const item: PageElement = { i, role, name };
    if (value) item.value = value;
    if (section) item.section = section;
    return item;
  });
}

// Every highlight is pinned to the bound snapshot. An unpinned request is refused, never re-read.
// A control that was hidden, changed role, or gained a competitor since that read is stale:
// the old index is not reused and the request is not authorized again.
export function liveHighlight(
  msg: { text: string; role?: string; section?: string; generation?: number; index?: number; name?: string },
  liveGeneration: number,
  indexed: Map<number, Element>,
  snapshotRoles?: Map<number, string>,
): { result: HighlightResult; el?: Element } {
  if (msg.generation === undefined || msg.index === undefined || !msg.name) {
    return { result: { found: false, reason: "unbound", alternatives: [] } };
  }
  const stale: HighlightResult = { found: false, reason: "stale", alternatives: [] };
  if (msg.generation !== liveGeneration) return { result: stale };
  const el = indexed.get(msg.index);
  const current = collectControls();
  const eligible = el ? current.find((control) => control.el === el) : undefined;
  const snapRole = snapshotRoles?.get(msg.index);
  const nameOk = !!el && el.isConnected && norm(nameOf(el)) === norm(msg.name);
  const roleOk = snapRole === undefined || roleOf(el!) === snapRole;
  if (!nameOk || !roleOk || !eligible) return { result: stale };

  const resolved = resolveName(msg.text, pageElementsOf(current), msg.role, msg.section);
  if (resolved.status === "found") {
    const match = current.find((control) => control.i === resolved.i);
    if (match?.el !== el) return { result: stale };
    return { result: { found: true, i: msg.index, name: msg.name, confidence: resolved.confidence }, el };
  }
  const known = new Set(indexed.values());
  if (current.some((control) => !known.has(control.el))) return { result: stale };
  return { result: resolutionResult(msg.text, resolved) };
}
