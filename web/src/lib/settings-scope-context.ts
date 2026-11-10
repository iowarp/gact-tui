import { createContext } from 'react';

export type SettingsScopeGroup = 'App' | 'Workspace' | 'Agent';

export interface SettingsScope {
  /** Which scope the page belongs to; picks the icon before the line. */
  group: SettingsScopeGroup;
  /** Where the page's settings apply, e.g. "CLIO local, applies to every conversation on this agent". */
  line: string;
  /** The agent, workspace or "App" the line names, for a page that words its own line. */
  place: string;
}

/** Where the page's settings apply, shown under every page title in the Settings window. */
export const SettingsScopeContext = createContext<SettingsScope | undefined>(undefined);
