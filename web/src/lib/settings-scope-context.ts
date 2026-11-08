import { createContext } from 'react';

/** Where the page's settings apply, shown under every page title in the Settings window. */
export const SettingsScopeContext = createContext<string | undefined>(undefined);
