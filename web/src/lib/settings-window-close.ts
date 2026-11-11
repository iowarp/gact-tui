import { createContext, useContext } from 'react';

/** Closes the Settings window the way its own close control does; absent outside it. */
export const SettingsWindowCloseContext = createContext<(() => void) | undefined>(undefined);

export function useCloseSettingsWindow(): (() => void) | undefined {
  return useContext(SettingsWindowCloseContext);
}
