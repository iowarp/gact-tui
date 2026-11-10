import { createContext, type ReactNode } from 'react';
import type { ObservabilityView } from './observability-view-storage';

/**
 * Lets a host that owns the view switch name the observability view. With a
 * value, the observability surface shows exactly that view and no tabs of its
 * own; `renderHeader` draws the host's header with the view's own actions
 * (Activity's search and filter) beside its title.
 */
export const ObservabilityViewControl = createContext<
  { view: ObservabilityView; renderHeader?: (actions: ReactNode) => ReactNode } | undefined
>(undefined);
