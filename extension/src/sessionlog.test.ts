import { describe, expect, it } from "vitest";
import { SessionLog } from "./sessionlog.ts";

describe("SessionLog", () => {
  it("is empty until something happens", () => {
    expect(new SessionLog().summary()).toBe("");
  });

  it("summarises the conversation, steps and app events in order", () => {
    const log = new SessionLog();
    log.add("app", 'Teach mode started: "Deploy a Cloud Run service our way"');
    log.add("step", 'set "Region" to "europe-west1"');
    log.add("model", "Why europe-west1 here?");
    log.add("user", "EU customer");
    log.add("app", 'Playbook draft ready: "Deploy a Cloud Run Service" (14 steps), waiting for review');
    expect(log.summary()).toBe(
      [
        "Session so far (oldest first):",
        '- App: Teach mode started: "Deploy a Cloud Run service our way"',
        '- Recorded step: set "Region" to "europe-west1"',
        "- GuideRail said: Why europe-west1 here?",
        "- User said: EU customer",
        '- App: Playbook draft ready: "Deploy a Cloud Run Service" (14 steps), waiting for review',
      ].join("\n"),
    );
  });

  it("keeps every app event but only the most recent other entries", () => {
    const log = new SessionLog();
    log.add("app", "Teach mode started");
    for (let i = 0; i < 10; i++) log.add("step", `step ${i}`);
    const s = log.summary(3);
    expect(s).toContain("App: Teach mode started");
    expect(s).toContain("step 9");
    expect(s).not.toContain("step 6");
    expect(s).toContain("earlier entries omitted");
  });

  it("ignores blank text and trims long entries", () => {
    const log = new SessionLog();
    log.add("user", "   ");
    log.add("model", "x".repeat(300));
    expect(log.size).toBe(1);
    expect(log.summary()).toMatch(/x{197}…/);
  });
});
