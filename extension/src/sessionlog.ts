// What has happened in this side-panel session, so a new Live connection (e.g. after switching
// Teach ↔ Guide) still knows the conversation, the steps taught and the app's state.

export type Entry = { kind: "user" | "model" | "step" | "app"; text: string };

const LABEL: Record<Entry["kind"], string> = {
  user: "User said",
  model: "GuideRail said",
  step: "Recorded step",
  app: "App",
};

export class SessionLog {
  private entries: Entry[] = [];

  add(kind: Entry["kind"], text: string) {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) this.entries.push({ kind, text: t.length > 200 ? `${t.slice(0, 197)}…` : t });
  }

  get size() { return this.entries.length; }

  // App events are always kept (they're the session's state); other entries keep the most recent `max`.
  summary(max = 40): string {
    if (!this.entries.length) return "";
    const recent = new Set(this.entries.slice(-max));
    const kept = this.entries.filter((e) => e.kind === "app" || recent.has(e));
    const dropped = this.entries.length - kept.length;
    return [
      "Session so far (oldest first):",
      ...(dropped ? [`- (${dropped} earlier entries omitted)`] : []),
      ...kept.map((e) => `- ${LABEL[e.kind]}: ${e.text}`),
    ].join("\n");
  }
}
