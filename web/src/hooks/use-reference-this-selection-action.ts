import { ChartLineIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSelectionAction } from './use-selection-action';
import { annotationFromSelection } from '@/lib/composer-annotations';
import type { SelectionAction } from '@/lib/selection-actions';
import type { ComposerDraft } from './use-composer-draft';

/**
 * Registers "Reference this" (#1533 item 5): a chart/map/table zone is
 * attached to this session's composer draft as a precise, re-queryable
 * reference block, and the composer takes focus — the same mechanism
 * `useAddToChatSelectionAction` uses for a quoted run of text, over the
 * `data-surface-zone` selection kind instead of `agent-answer-text`.
 */
export function useReferenceThisSelectionAction(
  draft: Pick<ComposerDraft, 'annotations' | 'onAnnotationsChange'>,
  focusComposer: () => void,
) {
  const latest = useRef({ draft, focusComposer });
  useEffect(() => {
    latest.current = { draft, focusComposer };
  });
  const action = useMemo<SelectionAction>(
    () => ({
      id: 'reference-this',
      label: 'Reference this',
      icon: ChartLineIcon,
      order: 10,
      kinds: ['data-surface-zone'],
      run: (target) => {
        const { draft: current, focusComposer: focus } = latest.current;
        current.onAnnotationsChange([...current.annotations, annotationFromSelection(target)]);
        focus();
      },
    }),
    [],
  );
  useSelectionAction(action);
}
