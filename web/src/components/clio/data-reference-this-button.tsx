import { ChartLineIcon } from 'lucide-react';
import { useContext } from 'react';
import { Button } from '@/components/ui/button';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import type { DataSurfaceZoneSelection } from '@/lib/selection-actions';
import type { DataZoneReference } from './data-zone-reference';

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
}: {
  buildReference: () => DataZoneReference;
  disabled?: boolean;
}) {
  const registry = useContext(SelectionActionsContext);
  if (!registry) return null;
  return (
    <Button
      className="gap-1.5 text-xs"
      disabled={disabled}
      onClick={() => {
        const reference = buildReference();
        const target: DataSurfaceZoneSelection = {
          kind: 'data-surface-zone',
          markdown: reference.markdown,
          title: reference.title,
        };
        for (const action of registry.actionsFor(target)) action.run(target);
      }}
      size="sm"
      variant="outline"
    >
      <ChartLineIcon aria-hidden="true" className="size-3.5" />
      Reference this
    </Button>
  );
}
