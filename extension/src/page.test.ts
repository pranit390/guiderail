// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BAD_DARK, BAD_LIGHT, contrastRatio, EDGE_DARK, EDGE_LIGHT, findSection, isSecret, labelValueInput, nameOf, roleOf, sectionOf, valueOf, violationFieldElement, violationFieldLabel } from "./page.ts";

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

afterEach(() => vi.restoreAllMocks());

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

  it("edge colours meet >=3:1 on light and dark surroundings", () => {
    expect(contrastRatio(EDGE_LIGHT, "rgb(255,255,255)")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(EDGE_LIGHT, "rgb(248,250,253)")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(EDGE_DARK, "rgb(22,29,40)")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(EDGE_DARK, "rgb(15,20,28)")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(BAD_LIGHT, "rgb(255,255,255)")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(BAD_DARK, "rgb(22,29,40)")).toBeGreaterThanOrEqual(3);
  });

  it("maps label:key to its exact value input, never the whole Labels section", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 100, 200, 60));
    document.body.innerHTML = `
      <style>* { opacity: 1; }</style>
      <section aria-labelledby="lh"><h3 id="lh">Labels</h3>
        <input aria-label="Key 1" value="environment"><input aria-label="Value 1" value="production">
        <input aria-label="Key 2" value="owner"><input aria-label="Value 2" value="bad@example.com">
      </section>
      <label for="role">Role</label><select id="role"><option>Owner</option></select>
      <div role="radio" aria-label="Test mode">Test mode</div>`;
    const ownerValue = document.querySelector('input[aria-label="Value 2"]')!;
    expect(labelValueInput("owner")).toBe(ownerValue);
    expect(violationFieldElement("label:owner")).toBe(ownerValue);
    expect(violationFieldElement("label:environment")).toBe(document.querySelector('input[aria-label="Value 1"]'));
    // A missing key has no value input: nothing is marked, and several missing keys never stack on one empty pair.
    (document.querySelector('input[aria-label="Key 1"]') as HTMLInputElement).value = "";
    expect(labelValueInput("component")).toBeNull();
    expect(violationFieldElement("label:environment")).toBeNull();
    // Generic fields resolve the real observed control by accessible name.
    expect(violationFieldElement("Role")).toBe(document.getElementById("role"));
    expect(violationFieldElement("Test mode")?.getAttribute("role")).toBe("radio");
    const hiddenRadio = document.createElement("input");
    hiddenRadio.setAttribute("aria-label", "Test mode");
    hiddenRadio.style.visibility = "hidden";
    document.body.prepend(hiddenRadio);
    expect(violationFieldElement("Test mode")?.getAttribute("role")).toBe("radio");
    // A field whose real control is gone is not mapped to a heading or button with the same name.
    document.body.insertAdjacentHTML("beforeend", `<h3>Database ID</h3><button>Save</button>`);
    expect(violationFieldElement("Database ID")).toBeNull();
    expect(violationFieldElement("Save")).toBeNull();
    expect(violationFieldLabel("label:owner")).toBe("owner value");
    expect(violationFieldLabel("Role")).toBe("Role");
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
