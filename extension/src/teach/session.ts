import { compact, type TeachEvent } from "./events.ts";

export class TeachSession {
  private events: TeachEvent[] = [];
  private speech: Record<"user" | "model", string> = { user: "", model: "" };
  private lastQuestion: string | null = null;

  constructor(readonly goal: string, private now: () => number = Date.now) {}

  add(e: TeachEvent) { this.events.push(e); }

  heard(role: "user" | "model", text: string) { this.speech[role] += text; }

  endTurn(role: "user" | "model") {
    const text = this.speech[role].trim();
    this.speech[role] = "";
    if (!text) return;
    if (role === "model") {
      this.lastQuestion = text.endsWith("?") ? text : null;
      return;
    }
    if (this.lastQuestion) {
      this.events.push({ t: "answer", at: this.now(), question: this.lastQuestion, text });
      this.lastQuestion = null;
    } else {
      this.events.push({ t: "narration", at: this.now(), text });
    }
  }

  get count() { return this.events.length; }

  payload() { return { goal: this.goal, events: compact(this.events) }; }
}

export function describeForModel(e: TeachEvent): string | null {
  const where = (s?: string) => (s ? ` (in ${s})` : "");
  switch (e.t) {
    case "click": return `Expert clicked the ${e.target.role} "${e.target.name}"${where(e.target.section)}.`;
    case "field": return `Expert set "${e.target.name}"${where(e.target.section)} to "${e.value}".`;
    case "navigate": return `Expert opened ${e.url} (${e.title}).`;
    default: return null;
  }
}

// In Teach mode the model should only be heard when it asks something, or answers the expert.
// A bare "Got it." after a click is dropped.
export function shouldSpeak(modelText: string, expertSpoke: boolean): boolean {
  const text = modelText.trim();
  if (!text) return false;
  return text.includes("?") || expertSpoke;
}
