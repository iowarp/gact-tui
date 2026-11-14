import { textQuoteFromSelection } from '@/components/clio/comments/text-anchor';
import type { FileTextSelection } from './selection-actions';

/**
 * File viewers offer the shared selection menu on their text. A viewer's body
 * names its file with `data-selection-surface="file"`, `data-file-path` (the
 * workspace-relative path) and, when it has one, `data-workspace-id`. Rows that
 * carry `data-line="n"` give the passage its line range.
 */
export const FILE_SELECTION_SURFACE = '[data-selection-surface="file"]';

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function lineOf(node: Node): number | undefined {
  const row = elementOf(node)?.closest<HTMLElement>('[data-line]');
  const line = Number(row?.dataset.line);
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

/** "lines 12–18", "line 4", or nothing when the viewer has no numbered rows. */
export function lineRangeLabel(startLine?: number, endLine?: number): string {
  if (startLine === undefined) return '';
  // Anchor metadata recorded with the comment and sent to the agent: not interface copy.
  if (endLine !== undefined && endLine !== startLine) return `lines ${startLine}–${endLine}`; // i18n-ignore: anchor metadata for the agent
  return `line ${startLine}`; // i18n-ignore: anchor metadata for the agent
}

/**
 * The file passage a DOM selection represents, or nothing. Both ends must lie in
 * one file viewer's body, outside a text field (an editor owns its selection).
 */
export function fileTextSelection(selection: Selection | null): FileTextSelection | undefined {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const start = elementOf(range.startContainer);
  const surface = start?.closest<HTMLElement>(FILE_SELECTION_SURFACE);
  if (!surface || surface !== elementOf(range.endContainer)?.closest(FILE_SELECTION_SURFACE)) {
    return undefined;
  }
  const container = elementOf(range.commonAncestorContainer);
  if (!container || container.closest('input, textarea, [contenteditable="true"]'))
    return undefined;
  const path = surface.dataset.filePath ?? '';
  const quote = path ? textQuoteFromSelection(surface, selection) : undefined;
  if (!quote?.exact) return undefined;
  const name = surface.dataset.fileName || path.split('/').filter(Boolean).at(-1) || path;
  const workspaceId = surface.dataset.workspaceId || undefined;
  const first = lineOf(range.startContainer);
  const last = lineOf(range.endContainer);
  const startLine = first !== undefined && last !== undefined ? Math.min(first, last) : first;
  const endLine = first !== undefined && last !== undefined ? Math.max(first, last) : undefined;
  const lines = lineRangeLabel(startLine, endLine);
  return {
    kind: 'file-text',
    text: quote.exact,
    path,
    name,
    ...(workspaceId ? { workspaceId } : {}),
    ...(startLine !== undefined ? { startLine, endLine: endLine ?? startLine } : {}),
    anchor: {
      ...quote,
      source_path: path,
      source: {
        path,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(lines ? { lines, line_start: startLine, line_end: endLine ?? startLine } : {}),
      },
    },
    container,
  };
}

/** Turns the current selection into a comment mark; true when it made one. */
export type SelectionCommenter = (selection: Selection | null) => boolean;

const commenters = new WeakMap<Element, SelectionCommenter>();

/**
 * Offers "Comment" on selections inside `element` while registered. The
 * innermost registered element holding a selection is the one that comments.
 */
export function registerSelectionCommenter(
  element: Element,
  commenter: SelectionCommenter,
): () => void {
  commenters.set(element, commenter);
  return () => {
    if (commenters.get(element) === commenter) commenters.delete(element);
  };
}

/** The commenter for the selection a target was read from, if a comment session holds it. */
export function selectionCommenter(target: { container: Element }): SelectionCommenter | undefined {
  for (let at: Element | null = target.container; at; at = at.parentElement) {
    const commenter = commenters.get(at);
    if (commenter) return commenter;
  }
  return undefined;
}
