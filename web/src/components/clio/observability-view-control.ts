import { createContext } from 'react';
import type { ObservabilityView } from './observability-view-storage';

/**
 * Lets a host that owns the view switch name the observability view. With a
 * value, the observability surface shows exactly that view and no tabs of its own.
 */
export const ObservabilityViewControl = createContext<{ view: ObservabilityView } | undefined>(
  undefined,
);
