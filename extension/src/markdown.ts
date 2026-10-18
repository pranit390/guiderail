/** A deliberately small Markdown vocabulary. All unrecognised syntax is text. */
function inline(parent: HTMLElement, text: string, depth = 0) {
  if (depth > 3) { parent.append(document.createTextNode(text)); return; }
  const tokens = /`([^`\n]+)`|\*\*([^\n]+?)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let start = 0;
  for (const match of text.matchAll(tokens)) {
    parent.append(document.createTextNode(text.slice(start, match.index)));
    const tag = match[1] !== undefined ? "code" : match[2] !== undefined ? "strong" : "em";
    const node = document.createElement(tag);
    const value = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (tag === "code") node.textContent = value;
    else inline(node, value, depth + 1);
    parent.append(node);
    start = match.index + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}

export function renderMarkdown(parent: HTMLElement, text: string) {
  const fragment = document.createDocumentFragment();
  let list: HTMLUListElement | HTMLOListElement | undefined;
  let paragraph: HTMLParagraphElement | undefined;
  for (const line of text.split("\n")) {
    const item = /^\s*(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      const kind = item[1] ? "UL" : "OL";
      if (list?.tagName !== kind) {
        list = document.createElement(item[1] ? "ul" : "ol"); fragment.append(list);
      }
      const li = document.createElement("li"); inline(li, item[2]); list.append(li); paragraph = undefined;
    } else {
      list = undefined;
      if (!line.trim()) { paragraph = undefined; continue; }
      if (!paragraph) { paragraph = document.createElement("p"); fragment.append(paragraph); }
      else paragraph.append(document.createTextNode("\n"));
      inline(paragraph, line);
    }
  }
  parent.replaceChildren(fragment);
}
