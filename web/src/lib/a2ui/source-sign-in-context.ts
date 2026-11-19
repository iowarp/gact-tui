import { createContext, useContext } from 'react';
import type { DataSourceIntent } from './data-source-action';

export const SourceSignInContext = createContext<((intent: DataSourceIntent) => void) | null>(null);

/** The workspace the sign-in host belongs to, for a sign-in a plugin's server asks for. */
export const SourceSignInWorkspaceContext = createContext<string | undefined>(undefined);

export function useSourceSignInWorkspace(): string | undefined {
  return useContext(SourceSignInWorkspaceContext);
}

/** Access the workspace's trusted authorization host, never an offline archive. */
export function useSourceSignIn(): ((intent: DataSourceIntent) => void) | null {
  return useContext(SourceSignInContext);
}
