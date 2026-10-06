import { ChartLineIcon } from 'lucide-react';
import { useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import type { DataSurfaceZoneSelection } from '@/lib/selection-actions';
import type { DataZoneReference } from './data-zone-reference';
import { SurfaceReferenceContext } from './surface-reference-context';

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
  if (!registry) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Reference this"
            disabled={disabled}
            onClick={() => {
              const reference = buildReference();
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
        <TooltipContent side="bottom">Reference this data in your message</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
