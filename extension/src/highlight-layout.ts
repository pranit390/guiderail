export type Rect = { left: number; top: number; width: number; height: number };
export const right = (r: Rect) => r.left + r.width;
export const bottom = (r: Rect) => r.top + r.height;
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < right(b) && b.left < right(a) && a.top < bottom(b) && b.top < bottom(a);
}
export function padded(r: Rect, pad: number): Rect {
  return { left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

/** Measure the clickable choice, not just the native dot painted by Material. */
export function highlightRegion(control: Element): { rect: Rect; radius: number } {
  const choice = control.closest('[role="radio"],[role="checkbox"],label');
  const labels = control instanceof HTMLInputElement && /^(radio|checkbox)$/.test(control.type)
    ? [...(control.labels ?? [])] : [];
  const elements = [choice ?? control, ...labels].filter((el) => {
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
  });
  const rects = (elements.length ? elements : [control]).map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  const rect = { left, top, width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top };
  const surface = choice ?? labels[0] ?? control;
  const radius = getComputedStyle(surface).borderTopLeftRadius;
  return { rect, radius: Math.max(4, radius.endsWith("%") ? Math.min(rect.width, rect.height) * parseFloat(radius) / 100 : parseFloat(radius) || 0) };
}

/** Prefer the right, then left, then above/below. A failed placement stays hidden. */
export function placeTag(target: Rect, size: { width: number; height: number }, viewport: { width: number; height: number }, obstacles: readonly Rect[]): Rect | null {
  const margin = 8, gap = 12;
  const { width, height } = size;
  if (width <= 0 || height <= 0 || width > viewport.width - margin * 2 || height > viewport.height - margin * 2) return null;
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - height - margin));
  const middleY = target.top + (target.height - height) / 2;
  const middleX = target.left + (target.width - width) / 2;
  const candidates: Rect[] = [
    { left: right(target) + gap, top: clampY(middleY), width, height },
    { left: target.left - gap - width, top: clampY(middleY), width, height },
    { left: clampX(middleX), top: target.top - gap - height, width, height },
    { left: clampX(middleX), top: bottom(target) + gap, width, height },
  ];
  return candidates.find((r) => r.left >= margin && r.top >= margin && right(r) <= viewport.width - margin && bottom(r) <= viewport.height - margin
    && !overlaps(r, padded(target, 8)) && !obstacles.some((o) => overlaps(r, padded(o, 4)))) ?? null;
}

/** Text line boxes count as occupied space, including descriptions and shadow DOM. */
export function pageObstacles(root: Document | ShadowRoot = document): Rect[] {
  const rects: Rect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element) {
        if (node.localName === "guiderail-overlay" || node.matches("script,style,noscript")) return NodeFilter.FILTER_REJECT;
        const style = getComputedStyle(node);
        if (node.hasAttribute("hidden") || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    } else if (node instanceof Element) {
      if (node.matches('input,select,textarea,button,iframe,[role="button"],[role="radio"],[role="checkbox"],[contenteditable="true"]')) rects.push(node.getBoundingClientRect());
      if (node.shadowRoot) rects.push(...pageObstacles(node.shadowRoot));
    }
  }
  return rects.filter((r) => r.width > 0 && r.height > 0);
}
