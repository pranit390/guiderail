import { describe, expect, it } from "vitest";
import { describeForModel, TeachSession } from "./session.ts";

const clock = () => { let t = 0; return () => ++t; };

describe("TeachSession", () => {
  it("turns user speech into narration", () => {
    const s = new TeachSession("Deploy", clock());
    s.heard("user", "I always pick ");
    s.heard("user", "us-central1");
    s.endTurn("user");
    expect(s.payload().events).toEqual([{ t: "narration", at: 1, text: "I always pick us-central1" }]);
  });
  it("records the expert's reply to a model question as an answer", () => {
    const s = new TeachSession("Deploy", clock());
    s.heard("model", "Why us-central1?");
    s.endTurn("model");
    s.heard("user", "Latency for our users");
    s.endTurn("user");
    expect(s.payload().events).toEqual([{ t: "answer", at: 1, question: "Why us-central1?", text: "Latency for our users" }]);
  });
  it("compacts events in the payload", () => {
    const s = new TeachSession("Deploy", clock());
    for (const v of ["o", "oc", "ocr"]) s.add({ t: "field", at: 0, url: "u", target: { role: "textbox", name: "Service name" }, value: v });
    expect(s.payload().events).toHaveLength(1);
  });
});

describe("TeachSession flush", () => {
  it("includes pending speech in the payload only after endTurn, and flushing twice is harmless", () => {
    const s = new TeachSession("Deploy");
    s.heard("user", "I pick us-central1 for latency");
    expect(s.payload().events).toHaveLength(0);
    s.endTurn("user");
    s.endTurn("model");
    s.endTurn("user");
    expect(s.payload().events).toMatchObject([{ t: "narration", text: "I pick us-central1 for latency" }]);
  });
});

describe("describeForModel", () => {
  it("describes clicks and fields for the Teach-mode model", () => {
    expect(describeForModel({ t: "click", at: 0, url: "u", title: "", target: { role: "tab", name: "Labels", section: "Info panel" } }))
      .toBe('Expert clicked the tab "Labels" (in Info panel).');
    expect(describeForModel({ t: "field", at: 0, url: "u", target: { role: "combobox", name: "Region" }, value: "us-central1" }))
      .toBe('Expert set "Region" to "us-central1".');
    expect(describeForModel({ t: "narration", at: 0, text: "x" })).toBeNull();
  });
});
