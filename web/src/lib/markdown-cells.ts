/** The part of a hast table-cell child this check reads. */
export type CellChild = { type: string; tagName?: string; value?: string };

/**
 * True when a markdown table cell holds one inline code element and nothing
 * else but whitespace. CSS `:only-child` ignores text nodes, so it can't tell
 * an identifier cell from a sentence with one inline code name.
 */
export function isCodeOnlyCell(children: readonly CellChild[] | undefined): boolean {
  let code = 0;
  for (const child of children ?? []) {
    if (child.type === 'text') {
      if (child.value?.trim()) return false;
    } else if (child.type === 'element' && child.tagName === 'code') {
      code += 1;
    } else {
      return false;
    }
  }
  return code === 1;
}
