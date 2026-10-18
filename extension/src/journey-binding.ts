import { FIRESTORE_GOAL, parseCompileRequest } from "../../shared/journey.ts";

export function consoleProject(url: string | undefined): string | undefined {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.origin !== "https://console.firebase.google.com" || parsed.username || parsed.password) return undefined;
    return /^\/project\/([a-z0-9-]+|_)\/firestore(?:\/|$)/.exec(parsed.pathname)?.[1];
  } catch { return undefined; }
}

export class JourneyBinding {
  private bound: { tabId: number; project?: string } | undefined;
  private opening = false;
  generation = 0;
  get tabId() { return this.bound?.tabId; }
  clear() { this.bound = undefined; this.generation++; }

  async open(args: unknown) {
    parseCompileRequest(args);
    if (this.opening) throw new Error("The Journey tab is already opening.");
    if (this.bound) return this.tab();
    this.opening = true;
    const generation = this.generation;
    try {
      const tab = await chrome.tabs.create({ url: FIRESTORE_GOAL.consoleUrl });
      if (tab.id === undefined) throw new Error("The Journey tab could not be opened. Retry.");
      if (generation !== this.generation) throw new Error("The Journey ended while its tab was opening. Start again.");
      this.bound = { tabId: tab.id };
      return tab;
    } finally { this.opening = false; }
  }

  accepts(tab: { id?: number; url?: string; pendingUrl?: string }): boolean {
    if (!this.bound || tab.id !== this.bound.tabId) return false;
    const project = consoleProject(tab.url);
    if (!project || (tab.pendingUrl && !consoleProject(tab.pendingUrl))) return false;
    if (this.bound.project && (project !== this.bound.project || (tab.pendingUrl && consoleProject(tab.pendingUrl) !== this.bound.project))) return false;
    if (project !== "_") this.bound.project = project;
    return true;
  }

  async tab(): Promise<chrome.tabs.Tab> {
    if (!this.bound) throw new Error("Open the Firestore Goal first.");
    const tab = await chrome.tabs.get(this.bound.tabId).catch(() => undefined);
    if (!tab) throw new Error("Journey paused: the bound tab was closed. Start a new Journey.");
    if (!this.accepts(tab)) throw new Error("Journey paused: return the bound tab to its Firebase Firestore project. Sign-in and other pages are never read.");
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id !== tab.id) throw new Error("Journey paused: return to the bound Firestore tab and re-read. Other tabs are never used.");
    return tab;
  }
}
