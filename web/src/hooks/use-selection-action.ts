import { useContext, useEffect } from 'react';
import type { SelectionAction, SelectionActionRegistry } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';

/** The registry `SelectionActionsProvider` owns. */
export function useSelectionActionRegistry(): SelectionActionRegistry {
  const registry = useContext(SelectionActionsContext);
  if (!registry) throw new Error('Selection actions need a SelectionActionsProvider.');
  return registry;
}

/**
 * Offer `action` on selections while the calling component is mounted.
 * Pass `undefined` to offer nothing (e.g. while the feature is unavailable).
 */
export function useSelectionAction(action: SelectionAction | undefined) {
  const registry = useSelectionActionRegistry();
  useEffect(() => (action ? registry.register(action) : undefined), [action, registry]);
}
