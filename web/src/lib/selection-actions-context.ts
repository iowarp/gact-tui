import { createContext } from 'react';
import type { SelectionActionRegistry } from './selection-actions';

/** The one selection-action registry, provided by `SelectionActionsProvider`. */
export const SelectionActionsContext = createContext<SelectionActionRegistry | undefined>(
  undefined,
);
