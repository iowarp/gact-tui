import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const InfraTabActionsContext = createContext<HTMLElement | null>(null);

export const InfraTabActionsProvider = InfraTabActionsContext.Provider;

/**
 * Controls for the open Infrastructure tab (host selector, Install service,
 * Inspect again), drawn at the right end of the tab bar. The tab body owns
 * them, so their state stays with the inventory they act on.
 */
export function InfraTabActions({ children }: { children: ReactNode }) {
  const target = useContext(InfraTabActionsContext);
  return target ? createPortal(children, target) : null;
}
