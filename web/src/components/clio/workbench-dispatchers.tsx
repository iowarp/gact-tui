import { useEffect, useEffectEvent, useLayoutEffect } from 'react';
import type { ClioWorkbenchOpenRequest } from './workbench-open-request';

/** A strip chord pressed while the pocket was unmounted (closed Sheet) lands here. */
export function PendingStripDispatcher({
  onTake,
  position,
}: {
  onTake: (position: number | 'terminal') => void;
  position?: number | 'terminal';
}) {
  const take = useEffectEvent(onTake);
  useEffect(() => {
    if (position !== undefined) take(position);
  }, [position]);
  return null;
}

export function WorkbenchRequestDispatcher({
  active,
  onDelivered,
  onOpen,
}: {
  active?: { key: string; request: ClioWorkbenchOpenRequest };
  onDelivered: (key: string) => void;
  onOpen: (request: ClioWorkbenchOpenRequest) => void;
}) {
  // Compact layouts mount the workbench only after their sheet opens. Keeping
  // the event in props lets this mounted child deliver the first resource
  // request instead of silently showing only the default Activity tab.
  // Layout effects: the first request lands before paint, in the mount's own commit.
  useLayoutEffect(() => {
    if (active) onOpen(active.request);
    onDelivered(active?.key ?? '');
  }, [onDelivered, onOpen, active]);
  return null;
}
