// Resolves a Step's control against the latest page read.
// Exact normalized accessible names win. A tie asks the person. Nothing below the
// existing 0.6 confidence is a match. A stale read or another tab cannot authorize
// a highlight or an Assist fill.
import type { HighlightResult, PageElement } from "./messages.ts";
import { nameOf, norm, roleOf, sectionOf } from "./page.ts";

export const MIN_CONFIDENCE = 0.6;

export type BoundSnapshot = {
  tabId: number;
  url: string;
  generation: number;
  elements: PageElement[];
};

export type TargetDecision =
  | { authorized: true; i: number; name: string; confidence: number }
  | { authorized: false; reason: "ambiguous"; alternatives: string[]; ask: string }
  | { authorized: false; reason: "missing"; alternatives: string[]; mismatch: string; citation?: string }
  | { authorized: false; reason: "stale" | "wrong_tab" | "unbound" };

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

// Exact normalized names first. Fuzzy candidates are only considered when no exact name exists.
export function resolveName(text: string, elements: PageElement[], role?: string): NameResolution {
  const query = norm(text);
  if (!query) return { status: "missing", alternatives: [] };
  const exact = elements.filter((e) => norm(e.name) === query);
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
  citation?: string;
  snapshot: BoundSnapshot | null;
  stale: boolean;
  tabId: number | null;
}): TargetDecision {
  const { snapshot, tabId } = input;
  if (!snapshot || tabId == null) return { authorized: false, reason: "unbound" };
  if (tabId !== snapshot.tabId) return { authorized: false, reason: "wrong_tab" };
  if (input.stale) return { authorized: false, reason: "stale" };
  const resolved = resolveName(input.text, snapshot.elements, input.role);
  if (resolved.status === "ambiguous") {
    return { authorized: false, reason: "ambiguous", alternatives: resolved.alternatives, ask: ambiguousAsk(input.text, resolved.alternatives) };
  }
  if (resolved.status === "missing") {
    const citation = input.citation?.trim() || undefined;
    return {
      authorized: false,
      reason: "missing",
      alternatives: resolved.alternatives,
      citation,
      mismatch: mismatchLine(input.text, citation),
    };
  }
  return { authorized: true, i: resolved.i, name: resolved.name, confidence: resolved.confidence };
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
  if (decision.reason === "ambiguous") return { found: false, reason: "ambiguous", alternatives: decision.alternatives, ask: decision.ask };
  if (decision.reason === "missing") {
    return { found: false, reason: "missing", alternatives: decision.alternatives, mismatch: decision.mismatch, citation: decision.citation };
  }
  return { found: false, reason: decision.reason, alternatives: [] };
}

export function highlightOutcome(decision: TargetDecision): string {
  if (decision.authorized) return `Pointing at ${decision.name}.`;
  if (decision.reason === "ambiguous") return decision.ask;
  if (decision.reason === "missing") return decision.mismatch;
  if (decision.reason === "stale") return "This screen changed since I last read it, so I won't point at or fill anything.";
  if (decision.reason === "wrong_tab") return "That screen is a different tab from the one I last read, so I won't point at or fill anything.";
  return "I haven't read this screen yet, so I won't point at or fill anything.";
}

// The live page still has to be the snapshot we authorized. A recycled node is not a target.
export function liveTargetOk(input: {
  requestedGeneration: number | undefined;
  liveGeneration: number;
  index: number | undefined;
  name: string | undefined;
  liveName: string | undefined;
  connected: boolean;
}): boolean {
  if (input.requestedGeneration === undefined || input.index === undefined || !input.name) return false;
  if (input.requestedGeneration !== input.liveGeneration) return false;
  if (!input.connected || input.liveName === undefined) return false;
  return norm(input.liveName) === norm(input.name);
}

function elementsNow(indexed: Map<number, Element>): PageElement[] {
  const elements: PageElement[] = [];
  for (const [i, el] of indexed) {
    if (!el.isConnected) continue;
    const name = nameOf(el);
    if (!name) continue;
    const item: PageElement = { i, role: roleOf(el), name };
    const section = sectionOf(el);
    if (section && section !== name) item.section = section;
    elements.push(item);
  }
  return elements;
}

// Every highlight is pinned to the bound snapshot. An unpinned request is refused, never re-read.
export function liveHighlight(
  msg: { text: string; role?: string; generation?: number; index?: number; name?: string },
  liveGeneration: number,
  indexed: Map<number, Element>,
): { result: HighlightResult; el?: Element } {
  if (msg.generation === undefined || msg.index === undefined || !msg.name) {
    return { result: { found: false, reason: "unbound", alternatives: [] } };
  }
  const stale: HighlightResult = { found: false, reason: "stale", alternatives: [] };
  const el = indexed.get(msg.index);
  const ok = liveTargetOk({
    requestedGeneration: msg.generation,
    liveGeneration,
    index: msg.index,
    name: msg.name,
    liveName: el ? nameOf(el) : undefined,
    connected: !!el?.isConnected,
  });
  if (!ok || !el) return { result: stale };
  // A pinned index still has to be the one resolved name. Two Saves cannot be forced by index.
  const resolved = resolveName(msg.text, elementsNow(indexed), msg.role);
  if (resolved.status === "ambiguous" || resolved.status === "missing") return { result: resolutionResult(msg.text, resolved) };
  if (resolved.i !== msg.index) return { result: stale };
  return { result: resolutionResult(msg.text, resolved), el };
}
