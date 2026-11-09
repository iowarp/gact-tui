import type { DocumentAnchor } from '@clio/core/v3';
import { AtSignIcon, MessageSquareIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { MarkPlace } from '@/components/clio/comments/comment-model';
import { useCommentSession } from '@/components/clio/comments/comment-session';
import { textQuoteFromSelection } from '@/components/clio/comments/text-anchor';
import { markFromSelection, withMark } from '@/lib/composer-annotations';
import type { SelectionAction } from '@/lib/selection-actions';
import {
  registerSelectionCommenter,
  selectionCommenter,
  type SelectionCommenter,
} from '@/lib/selection-actions-file';
import type { ComposerDraft } from './use-composer-draft';
import { useSelectionAction } from './use-selection-action';

/**
 * The selection menu on a file viewer's text: "Add to message" quotes the
 * passage (file and lines) in this session's composer draft; "Comment" makes
 * it a mark of the viewer's comment session, when the viewer has one.
 */
export function useFileSelectionActions(
  draft: Pick<ComposerDraft, 'annotations' | 'onAnnotationsChange'>,
  focusComposer: () => void,
) {
  const latest = useRef({ draft, focusComposer });
  useEffect(() => {
    latest.current = { draft, focusComposer };
  });
  const addToMessage = useMemo<SelectionAction>(
    () => ({
      id: 'file-add-to-message',
      label: 'Add to message',
      icon: AtSignIcon,
      order: 10,
      shortcut: 'add-to-message',
      kinds: ['file-text'],
      run: (target) => {
        const { draft: current, focusComposer: focus } = latest.current;
        const mark = markFromSelection(target);
        current.onAnnotationsChange(
          withMark(current.annotations, mark.kind, mark.title, mark.anchor),
        );
        focus();
      },
    }),
    [],
  );
  useSelectionAction(addToMessage);
  useSelectionAction(FILE_COMMENT_ACTION);
}

const FILE_COMMENT_ACTION: SelectionAction = {
  id: 'file-comment',
  label: 'Comment',
  icon: MessageSquareIcon,
  order: 20,
  shortcut: 'comment',
  kinds: ['file-text'],
  isAvailable: (target) => target.kind === 'file-text' && Boolean(selectionCommenter(target)),
  run: (target) =>
    target.kind === 'file-text'
      ? (selectionCommenter(target)?.(window.getSelection()) ?? false)
      : false,
};

/** Offers "Comment" on selections inside `host` with `commenter` while mounted. */
export function useSelectionCommenter(
  host: Element | null | undefined,
  commenter: SelectionCommenter | undefined,
) {
  const latest = useRef(commenter);
  useEffect(() => {
    latest.current = commenter;
  });
  const enabled = Boolean(commenter);
  useEffect(() => {
    if (!host || !enabled) return undefined;
    return registerSelectionCommenter(host, (selection) => latest.current?.(selection) ?? false);
  }, [host, enabled]);
}

/** A selection as a comment mark: its anchor and where it sits on screen. */
export interface SelectionMark {
  anchor: DocumentAnchor;
  place?: MarkPlace;
}

/**
 * Lets the selection menu's "Comment" add the mark `markOf` reads from a
 * selection inside `host` to the surrounding comment session, opening the
 * session first. A selection `markOf` can't read stays uncommented.
 */
export function useSelectionMarkCommenter(
  host: Element | null | undefined,
  markOf: (selection: Selection) => SelectionMark | undefined,
) {
  const session = useCommentSession();
  const latest = useRef({ session, markOf });
  useEffect(() => {
    latest.current = { session, markOf };
  });
  const hasSession = Boolean(session);
  const commenter = useMemo<SelectionCommenter | undefined>(() => {
    if (!hasSession) return undefined;
    return (selection) => {
      const { session: current, markOf: read } = latest.current;
      if (!current || !selection?.rangeCount) return false;
      const mark = read(selection);
      if (!mark) return false;
      if (current.open) {
        current.addMark(mark.anchor, mark.place);
        return true;
      }
      // Opening restores the version's drafts first, so the new mark is labelled after them.
      current.start();
      setTimeout(() => latest.current.session?.addMark(mark.anchor, mark.place), 0);
      return true;
    };
  }, [hasSession]);
  useSelectionCommenter(host, commenter);
}

/**
 * Lets the selection menu's "Comment" add a text-quote mark to the comment
 * session around `host` (a viewer's capture area), opening the session first.
 * Text a viewer anchors itself (`data-comment-text="own"`, a PDF's quads) is
 * left to that viewer's own commenter.
 */
export function useSelectionComment(host: Element | null | undefined, sourcePath?: string) {
  useSelectionMarkCommenter(host instanceof HTMLElement ? host : undefined, (selection) => {
    if (!(host instanceof HTMLElement)) return undefined;
    const range = selection.getRangeAt(0);
    const at =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    if (at?.closest('[data-comment-text="own"]')) return undefined;
    const quote = textQuoteFromSelection(host, selection);
    if (!quote) return undefined;
    const rect =
      typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : undefined;
    return {
      anchor: sourcePath ? { ...quote, source_path: sourcePath } : quote,
      place: rect
        ? { box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
        : {},
    };
  });
}
