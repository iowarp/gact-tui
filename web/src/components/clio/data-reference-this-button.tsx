import { ChartLineIcon } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import type { DataSurfaceZoneSelection } from '@/lib/selection-actions';
import type { DataZoneReference } from './data-zone-reference';
import { SurfaceReferenceContext } from './surface-reference-context';
import { referenceSelectedText, surfaceTextSelection } from '@/lib/surface-text-selection';
import { t } from '@lingui/core/macro';

/**
 * "Reference this" (#1533 item 5): attaches a chart/map/table zone to the
 * composer through the existing selection-action registry — the same
 * mechanism "Add to chat" uses (`gact-tui#488`), so no new wiring or
 * server/protocol change is needed to carry it. The reference itself is
 * computed lazily (only on click): building the preview and the exact
 * re-query JSON on every render would be wasted work for a control that is
 * clicked rarely.
 *
 * Reads the registry directly (not `useSelectionActionRegistry`, which
 * throws without a provider): a chart/map/table renders in plenty of
 * contexts a `SelectionActionsProvider` never wraps (a bare unit test, a
 * future standalone preview), and this control is an optional affordance,
 * not something the surface depends on to render at all.
 */
export function DataReferenceThisButton({
  buildReference,
  disabled,
  onReferenced,
}: {
  buildReference: () => DataZoneReference;
  disabled?: boolean;
  onReferenced?: () => void;
}) {
  const registry = useContext(SelectionActionsContext);
  const referenceAndClose = useContext(SurfaceReferenceContext);
  const button = useRef<HTMLButtonElement>(null);
  const [selectedText, setSelectedText] = useState('');
  const selectionRoot = () =>
    button.current?.closest('[data-a2ui-component-id]') ??
    button.current?.closest('[data-slot="dialog-content"]') ??
    button.current?.closest('.group') ??
    null;
  useEffect(() => {
    const update = () => setSelectedText(surfaceTextSelection(selectionRoot()));
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);
  if (!registry) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={selectedText ? t`Reference selected text` : t`Reference this`}
            ref={button}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const reference = referenceSelectedText(
                buildReference(),
                surfaceTextSelection(selectionRoot()),
              );
              const target: DataSurfaceZoneSelection = {
                kind: 'data-surface-zone',
                markdown: reference.markdown,
                summary: reference.summary,
                title: reference.title,
              };
              const actions = registry.actionsFor(target);
              if (actions.length === 0) return;
              const runReference = () => {
                for (const action of actions) action.run(target);
                window.getSelection()?.removeAllRanges();
                setSelectedText('');
                onReferenced?.();
              };
              if (referenceAndClose) referenceAndClose(runReference);
              else runReference();
            }}
            size="icon-sm"
            variant="ghost"
          >
            <ChartLineIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {selectedText
            ? t`Reference selected text in your message`
            : t`Reference this data in your message`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
