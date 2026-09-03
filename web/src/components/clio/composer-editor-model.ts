/**
 * How the composer's contenteditable is read as plain text.
 *
 * Kept apart from the editor component so both the model it publishes and the
 * caret an insertion needs are measured by exactly one walker.
 */

/**
 * The plain text a run of editor nodes stands for.
 *
 * One walker, so the value the composer sends, the offsets the tokens are
 * placed at, and the caret position an insertion uses are all measured on the
 * same scale. A reference token contributes no characters — it is a DOM node
 * holding a position, not text.
 */
export function collectPlainText(
  nodes: Iterable<Node>,
  onToken?: (identity: string, offset: number) => void,
): string {
  let value = '';
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const identity = node.dataset.referenceToken;
    if (identity) {
      onToken?.(identity, value.length);
      return;
    }
    if (node.tagName === 'BR') {
      value += '\n';
      return;
    }
    const startedAt = value.length;
    for (const child of node.childNodes) visit(child);
    if (node.tagName === 'DIV' && value.length > startedAt && !value.endsWith('\n')) value += '\n';
  };
  for (const node of nodes) visit(node);
  return value;
}

/**
 * Where the caret sits in the editor's plain text, or nothing when the editor
 * does not hold the selection. An insertion uses this so a reference chosen
 * from the picker lands where the person is typing rather than at the end.
 */
export function editorCaretOffset(root: HTMLElement | null): number | undefined {
  if (!root) return undefined;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return undefined;
  const measured = document.createRange();
  measured.selectNodeContents(root);
  measured.setEnd(range.startContainer, range.startOffset);
  return collectPlainText(measured.cloneContents().childNodes).length;
}
