// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { briefPrompt, findDocumentHeading, isPublicDoc, readDocument, routePageTool, PUBLIC_DOCS } from "./document.ts";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 20));
  vi.stubGlobal("location", new URL(PUBLIC_DOCS[0]));
  document.head.innerHTML = "<style>* { opacity: 1; }</style>";
  document.body.innerHTML = `<nav>Navigation noise</nav><article><h2>Create a database</h2><p>Choose a location before creation.</p><h5>Firebase console</h5><p>Click Add database.</p><section hidden><h2>Hidden heading</h2><p>Secret hidden text</p></section><form><input value="secret"><p>Private form content</p></form></article>`;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("public document page boundary", () => {
  it("reads rendered article prose and headings, not hidden text, menus or forms", () => {
    const doc = readDocument()!;
    expect(doc.text).toContain("Choose a location");
    expect(doc.text).not.toMatch(/Navigation noise|Secret hidden|Private form/);
    expect(doc.headings).toEqual(["Create a database", "Firebase console"]);
    expect(briefPrompt(doc)).toContain("untrusted data");
  });
  it("bounds the document text", () => {
    document.querySelector("article")!.append(document.createTextNode("x".repeat(30_000)));
    expect(readDocument()!.text.length).toBeLessThanOrEqual(12_000);
  });
  it("fits the whole brief of a long docs page into one relay message and says what was cut", () => {
    const article = document.querySelector("article")!;
    for (let k = 0; k < 80; k++) article.insertAdjacentHTML("beforeend", `<h3>Step ${k} "quoted" \\ heading</h3><p>${'Paragraph with "quotes" and \\ slashes. '.repeat(10)}</p>`);
    const doc = readDocument()!;
    expect(doc.text.length).toBeGreaterThan(4_000);
    const prompt = briefPrompt(doc)!;
    expect(prompt.length).toBeLessThanOrEqual(4_000);
    const sent = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
    expect(sent).toMatchObject({ url: doc.url, title: doc.title });
    expect(doc.text.startsWith(sent.text)).toBe(true);
    expect(sent.text.length).toBeGreaterThan(1_000);
    expect(sent.headings).toEqual(doc.headings.slice(0, sent.headings.length));
    expect(sent.headings.slice(0, 2)).toEqual(["Create a database", "Firebase console"]);
    expect(sent.truncated).toContain(`first ${sent.text.length} of ${doc.text.length} characters`);
    expect(sent.truncated).toContain(`of ${doc.headings.length} headings`);
  });
  it("sends a short page whole", () => {
    const doc = readDocument()!;
    expect(JSON.parse(briefPrompt(doc)!.split("\n")[1])).toEqual(doc);
  });
  it("supports both pinned public docs without allowing account or unrelated pages", () => {
    expect(isPublicDoc(PUBLIC_DOCS[1] + "?hl=en#grant-access")).toBe(true);
    for (const url of ["https://accounts.google.com", PUBLIC_DOCS[0] + "-fake", "https://example.com", "bad", "http://firebase.google.com/docs/firestore/manage-databases"]) expect(readDocument(url)).toBeUndefined();
  });
  it("highlights only a unique visible exact heading and refuses absent/hidden/ambiguous targets", () => {
    expect(findDocumentHeading("Create a database")?.tagName).toBe("H2");
    expect(findDocumentHeading("Create")).toBeUndefined();
    expect(findDocumentHeading("Hidden heading")).toBeUndefined();
    document.querySelector("article")!.insertAdjacentHTML("beforeend", "<h2>Create a database</h2>");
    expect(findDocumentHeading("Create a database")).toBeUndefined();
  });
});
describe("briefing to Journey transition", () => {
  const docs = { id: 7, url: PUBLIC_DOCS[0] };
  const console = { id: 9, url: "https://console.firebase.google.com/project/demo/firestore/databases" };
  it("keeps reads and highlights on the docs while the briefing tab is the active public doc", () => {
    expect(routePageTool("read_page", {}, 7, docs)).toEqual({ message: { kind: "read_page" }, ended: false });
    expect(routePageTool("highlight", { text: "Create a database" }, 7, docs)).toEqual({ message: { kind: "highlight_document", heading: "Create a database" }, ended: false });
  });
  it("ends the briefing and routes to the console when the person switches tabs", () => {
    expect(routePageTool("read_page", {}, 7, console)).toEqual({ message: { kind: "read_page" }, ended: true });
    expect(routePageTool("highlight", { text: "Add database", role: "button" }, 7, console)).toEqual({ message: { kind: "highlight", text: "Add database", role: "button" }, ended: true });
  });
  it("ends the briefing when the docs tab itself navigates to the console", () => {
    expect(routePageTool("highlight", { text: "Add database" }, 7, { id: 7, url: console.url })).toEqual({ message: { kind: "highlight", text: "Add database", role: undefined }, ended: true });
  });
  it("leaves Guide routing unchanged without a briefing", () => {
    expect(routePageTool("highlight", { text: "Create" }, undefined, console)).toEqual({ message: { kind: "highlight", text: "Create", role: undefined }, ended: false });
    expect(routePageTool("highlight_document", { heading: "Database ID" }, undefined, docs)).toEqual({ message: { kind: "highlight_document", heading: "Database ID" }, ended: false });
  });
});
