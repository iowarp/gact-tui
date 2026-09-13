/** Measure rendered text rows, including soft wraps, across composed content. */
export function displayLineBottoms(element: HTMLElement): number[] {
  const origin = element.getBoundingClientRect().top;
  const rows = new Map<number, number>();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim()) continue;
    if (node.parentElement?.closest('.sr-only, [aria-hidden="true"]')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (!rect.height || !rect.width) continue;
      const top = Math.round(rect.top - origin);
      rows.set(top, Math.max(rows.get(top) ?? 0, rect.bottom - origin));
    }
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, bottom]) => bottom);
}
