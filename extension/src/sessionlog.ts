// What has happened in this side-panel session, so a new Live connection (e.g. after switching
// Teach ↔ Guide) still knows the conversation, the steps taught and the app's state.

export type Entry = { kind: "user" | "model" | "step" | "app" | "page"; text: string };

const LABEL: Record<Entry["kind"], string> = {
  user: "User said",
  model: "GuideRail said",
  step: "Recorded step",
  app: "App",
  page: "Page event",
};

const MAX_ENTRIES = 200;
const MAX_APP_EVENTS = 10;
// The relay accepts at most 4,000 characters per message.
const MAX_SUMMARY_CHARS = 3_500;

export class SessionLog {
  private entries: Entry[] = [];

  add(kind: Entry["kind"], text: string) {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return;
    this.entries.push({ kind, text: t.length > 200 ? `${t.slice(0, 197)}…` : t });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  get size() { return this.entries.length; }

  // Recent app events are kept (they're the session's state) with the most recent `max` other entries,
  // then the oldest are dropped until the summary fits in one relay message.
  summary(max = 40): string {
    if (!this.entries.length) return "";
    const recent = new Set(this.entries.slice(-max));
    const apps = new Set(this.entries.filter((e) => e.kind === "app").slice(-MAX_APP_EVENTS));
    const lines = this.entries.filter((e) => apps.has(e) || recent.has(e)).map((e) => `- ${LABEL[e.kind]}: ${e.text}`);
    while (lines.join("\n").length > MAX_SUMMARY_CHARS) lines.shift();
    const dropped = this.entries.length - lines.length;
    return [
      "Session so far (oldest first):",
      ...(dropped ? [`- (${dropped} earlier entries omitted)`] : []),
      ...lines,
    ].join("\n");
  }
}
