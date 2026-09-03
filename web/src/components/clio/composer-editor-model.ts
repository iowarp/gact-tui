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

/**
 * Focus the editor at one of its plain-text offsets.
 *
 * Reference tokens have zero width in the text model. When a token and a text
 * boundary share the requested offset, the caret lands after every token at
 * that boundary. That is the useful side for a newly inserted token and keeps
 * the next typed character beside the reference rather than in front of it.
 */
export function focusEditorAtOffset(root: HTMLDivElement | null, offset?: number): void {
  if (!root || root.getAttribute('aria-disabled') === 'true') return;
  root.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  if (offset === undefined) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    const target = Math.max(0, Math.min(offset, collectPlainText(root.childNodes).length));
    let consumed = 0;
    let boundary: { container: Node; offset: number } = {
      container: root,
      offset: 0,
    };

    for (let index = 0; index < root.childNodes.length; index += 1) {
      const node = root.childNodes[index]!;
      if (node instanceof HTMLElement && node.dataset.referenceToken) {
        if (consumed === target) boundary = { container: root, offset: index + 1 };
        continue;
      }

      const text = collectPlainText([node]);
      const next = consumed + text.length;
      if (target < next || (target === consumed && text.length > 0)) {
        if (node.nodeType === Node.TEXT_NODE) {
          boundary = { container: node, offset: target - consumed };
        } else {
          // `writeModel` emits direct text nodes, but a browser may briefly wrap
          // manually entered lines. A range over that wrapper is the safe
          // fallback until the next controlled render normalises it.
          boundary = { container: root, offset: index };
        }
        break;
      }
      consumed = next;
      boundary = { container: root, offset: index + 1 };
    }

    range.setStart(boundary.container, boundary.offset);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
