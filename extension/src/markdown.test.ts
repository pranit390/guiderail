// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.ts";

describe("safe panel Markdown", () => {
  it("renders emphasis, literal inline code, paragraphs and lists", () => {
    const el = document.createElement("div");
    renderMarkdown(el, "Choose **Production mode** and *check* the _rules_. Use `**literal**`.\n\n- Read **this**\n- Keep private\n\n1. Next\n2. Review");
    expect(el.querySelector("strong")?.textContent).toBe("Production mode");
    expect([...el.querySelectorAll("em")].map((n) => n.textContent)).toEqual(["check", "rules"]);
    expect(el.querySelector("code")?.textContent).toBe("**literal**");
    expect(el.querySelectorAll("ul li")).toHaveLength(2);
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
  });
  it("keeps HTML, scripts and unsafe links as text", () => {
    const text = '<img src=x onerror=alert(1)> **<script>alert(1)</script>** [click](javascript:alert(1))';
    const el = document.createElement("div"); renderMarkdown(el, text);
    expect(el.querySelector("script,img,a")).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.textContent).toContain('[click](javascript:alert(1))');
  });
  it("handles emphasis completed by a later transcript chunk", () => {
    const el = document.createElement("div"); renderMarkdown(el, "Choose **Production");
    expect(el.textContent).toBe("Choose **Production");
    renderMarkdown(el, "Choose **Production mode**");
    expect(el.querySelector("strong")?.textContent).toBe("Production mode");
    expect(el.textContent).not.toContain("**");
  });
});
