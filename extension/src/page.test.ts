// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { findSection, isSecret, nameOf, roleOf, sectionOf, valueOf } from "./page.ts";

beforeEach(() => {
  document.body.innerHTML = `
    <label for="svc">Service name</label><input id="svc" value="ocr-service">
    <input type="password" id="pw" aria-label="Password">
    <section aria-labelledby="labels-h"><h3 id="labels-h">Labels</h3>
      <input aria-label="Key 1"><input aria-label="Value 1"></section>
    <div role="tablist"><div role="tab" aria-selected="true" aria-controls="p1">Labels</div></div>
    <div role="tabpanel" id="p1"><input aria-label="Key 1"></div>
    <h3>Containers, networking, security</h3>`;
});

describe("page helpers", () => {
  it("names inputs by their label element", () => {
    expect(nameOf(document.getElementById("svc")!)).toBe("Service name");
  });
  it("treats h3 as a heading", () => {
    expect(roleOf(document.querySelector("h3")!)).toBe("heading");
  });
  it("finds the section of an input in an aria-labelledby section", () => {
    const key = document.querySelector('section input[aria-label="Key 1"]')!;
    expect(sectionOf(key)).toBe("Labels");
  });
  it("flags password fields as secret", () => {
    expect(isSecret(document.getElementById("pw")!)).toBe(true);
  });
  it("finds a section by heading text", () => {
    expect(findSection("Labels")?.tagName).toBe("SECTION");
  });
  it("finds a section that is a selected tab's panel", () => {
    document.querySelector("section")!.remove();
    expect(findSection("Labels")?.id).toBe("p1");
  });

  it("reads values a person can see, including custom controls", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <span id="rl">Region</span><div id="cb" role="combobox" aria-labelledby="rl">europe-west1 (Belgium)</div>
      <select id="sel"><option>us-central1</option><option selected>asia-south1</option></select>
      <div id="sw" role="switch" aria-label="Public" aria-checked="true"></div>
      <input id="r1" type="radio" name="a"><div id="sl" role="slider" aria-label="CPU" aria-valuetext="2 vCPU"></div>`);
    expect(valueOf(document.getElementById("cb")!)).toBe("europe-west1 (Belgium)");
    expect(valueOf(document.getElementById("sel")!)).toBe("asia-south1");
    expect(valueOf(document.getElementById("sw")!)).toBe("checked");
    expect(valueOf(document.getElementById("r1")!)).toBeUndefined();
    expect(valueOf(document.getElementById("sl")!)).toBe("2 vCPU");
  });
});
