import { MessageSquareQuoteIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useFileSelectionActions } from './use-selection-action-file';
import { useSelectionAction } from './use-selection-action';
import { markFromSelection, withMark } from '@/lib/composer-annotations';
import type { SelectionAction } from '@/lib/selection-actions';
import type { ComposerDraft } from './use-composer-draft';

/**
 * Registers "Add to chat": a selection in any agent answer on screen (the main
 * conversation or a child agent open in the canvas) is attached to this
 * session's composer draft as a quote, and the composer takes focus. A passage
 * selected in a file viewer gets the file actions (Add to message, Comment).
 */
export function useAddToChatSelectionAction(
  draft: Pick<ComposerDraft, 'annotations' | 'onAnnotationsChange'>,
  focusComposer: () => void,
) {
  const latest = useRef({ draft, focusComposer });
  useEffect(() => {
    latest.current = { draft, focusComposer };
  });
  const action = useMemo<SelectionAction>(
    () => ({
      id: 'add-to-chat',
      label: 'Add to chat',
      icon: MessageSquareQuoteIcon,
      order: 10,
      kinds: ['agent-answer-text'],
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
  useSelectionAction(action);
  useFileSelectionActions(draft, focusComposer);
}
