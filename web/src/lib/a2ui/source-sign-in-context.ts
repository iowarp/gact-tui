import { createContext, useContext } from 'react';
import type { DataSourceIntent } from './data-source-action';

export const SourceSignInContext = createContext<((intent: DataSourceIntent) => void) | null>(null);

/** Access the workspace's trusted authorization host, never an offline archive. */
export function useSourceSignIn(): ((intent: DataSourceIntent) => void) | null {
  return useContext(SourceSignInContext);
}
