// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { briefPrompt, findDocumentHeading, isPublicDoc, readDocument, PUBLIC_DOCS } from "./document.ts";

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
