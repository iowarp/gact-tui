/**
 * Settings page inventory — the route-coverage record #337 requires.
 *
 * `backing` is a claim about reality, and `method` is the evidence for it:
 * a page marked `backend` names the @clio/core client method that serves it,
 * verified against the client surface rather than assumed from the prototype.
 *
 *   backend  — a real client method exists
 *   client   — genuinely local (preferences, build info, the connection
 *              registry); no backend route is expected or needed
 *   unbacked — nothing serves it on either side. SHIPS HIDDEN.
 *
 * Hiding is the point: a settings page with no backing promises a control that
 * cannot work, which is worse than the page being absent.
 */

export type PageBacking = 'backend' | 'client' | 'unbacked';

export interface SettingsPage {
  id: string;
  label: string;
  group: 'Connection' | 'Agents' | 'Telemetry' | 'App';
  backing: PageBacking;
  /** The @clio/core Client method serving this page. Required when backend. */
  method?: string;
  /** Whether the page's UI has been built yet. */
  built?: boolean;
  /** Why it is unbacked — recorded so the gap is legible, not just hidden. */
  gap?: string;
}

export const SETTINGS_PAGES: SettingsPage[] = [
  // ---- Connection ----
  {
    id: 'backends',
    label: 'Backends',
    group: 'Connection',
    backing: 'client',
    // The connection registry is client-held by design (D1: multi-connection
    // client, no hub). gact-tui#338 owns it.
  },

  // ---- Agents ----
  { id: 'session-defaults', label: 'Session defaults', group: 'Agents', backing: 'client' },
  { id: 'providers', label: 'Providers', group: 'Agents', backing: 'backend', method: 'providers()' },
  { id: 'models', label: 'Models', group: 'Agents', backing: 'backend', method: 'providerModels()' },
  { id: 'agents', label: 'Agents', group: 'Agents', backing: 'backend', method: 'agents()' },
  {
    id: 'relays',
    label: 'Relays',
    group: 'Agents',
    backing: 'unbacked',
    gap: 'No relay registry route exists. Federation runs through the session backend (clio-agent P2), and no client method lists or edits relay hosts.',
  },
  { id: 'commands', label: 'Commands', group: 'Agents', backing: 'backend', method: 'commands()' },
  { id: 'prompts', label: 'Prompts', group: 'Agents', backing: 'backend', method: 'prompts()' },
  {
    id: 'blueprints',
    label: 'Agent blueprints',
    group: 'Agents',
    backing: 'backend',
    method: 'agentBlueprints()',
  },
  {
    id: 'expert-packs',
    label: 'Expert packs',
    group: 'Agents',
    backing: 'backend',
    method: 'expertPacks()',
  },
  { id: 'mcp', label: 'MCP servers', group: 'Agents', backing: 'backend', method: 'mcpServers()' },

  // ---- Telemetry ----
  { id: 'hooks', label: 'Hooks', group: 'Telemetry', backing: 'backend', method: 'hooks()' },
  { id: 'policies', label: 'Policies', group: 'Telemetry', backing: 'backend', method: 'policies()' },
  { id: 'memory', label: 'Memory', group: 'Telemetry', backing: 'backend', method: 'memoryStats()' },
  { id: 'metrics', label: 'Metrics', group: 'Telemetry', backing: 'backend', method: 'metrics()' },
  { id: 'doctor', label: 'Doctor', group: 'Telemetry', backing: 'backend', method: 'health()' },

  // ---- App ----
  {
    id: 'plugins',
    label: 'Plugins',
    group: 'App',
    backing: 'unbacked',
    gap: 'The ported plugins module talks to the Tauri shell, not to a backend route. There is no client method to list or configure plugins.',
  },
  { id: 'appearance', label: 'Appearance', group: 'App', backing: 'client', built: true },
  {
    id: 'data',
    label: 'Data & backups',
    group: 'App',
    backing: 'unbacked',
    gap: 'No export/backup route on either side. Session export exists per-session (exportSession) but there is no workspace-level backup surface.',
  },
  { id: 'about', label: 'About', group: 'App', backing: 'client', built: true },
];

/** The pages that may be shown: everything with real backing. */
export function backedPages(): SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => page.backing !== 'unbacked');
}

/** The recorded gaps — hidden, but legible rather than forgotten. */
export function unbackedPages(): SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => page.backing === 'unbacked');
}
