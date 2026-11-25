/** Measure rendered text rows, including soft wraps, across composed content. */
export function displayLineBottoms(element: HTMLElement): number[] {
  const origin = element.getBoundingClientRect().top;
  const rows = new Map<number, number>();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (parent?.closest('.sr-only, [aria-hidden="true"]')) continue;
    // A closed disclosure's body is not on screen; its stale boxes cut the preview mid-row.
    if (
      parent?.matches('details:not([open])') ||
      parent?.closest('details:not([open]) > :not(summary)')
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (!rect.height || !rect.width) continue;
      const top = Math.round(rect.top - origin);
      rows.set(top, Math.max(rows.get(top) ?? 0, rect.bottom - origin));
    }
  }
  // Text of mixed sizes on one visual line has different tops. Rows that overlap are one
  // line, so a preview never ends inside the next row and shows its top half.
  const lines: number[] = [];
  let lastBottom = Number.NEGATIVE_INFINITY;
  for (const [top, bottom] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    if (top < lastBottom - 2 && lines.length) {
      lastBottom = Math.max(lastBottom, bottom);
      lines[lines.length - 1] = lastBottom;
    } else {
      lastBottom = bottom;
      lines.push(bottom);
    }
  }
  return lines;
}
