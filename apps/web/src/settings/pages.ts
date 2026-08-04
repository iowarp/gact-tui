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
    built: true,
    // The connection registry (connect/registry.ts loadRegistry, cross-
    // referenced with the live ConnectionPool via the `connections` prop) is
    // client-held by design (D1: multi-connection client, no hub).
  },

  // ---- Agents ----
  { id: 'session-defaults', label: 'Session defaults', group: 'Agents', backing: 'client', built: true },
  { id: 'providers', label: 'Providers', group: 'Agents', backing: 'backend', method: 'providers()', built: true },
  {
    id: 'models',
    label: 'Models',
    group: 'Agents',
    backing: 'backend',
    method: 'lmConfig() / providerModels()',
    built: true,
  },
  {
    id: 'agents',
    label: 'Agents',
    group: 'Agents',
    backing: 'client',
    built: true,
    // NOT client.agents() — that endpoint is the expert/agent-blueprint
    // CATALOG (AgentDef[]: title/tools/tier), a different concept entirely
    // (see SessionView.tsx's own note on `connectedCount`). The prototype's
    // "Agents" page is about connected clio DEPLOYMENTS across hosts, which
    // is the same live-connection data Backends and the rail footer popover
    // already carry (`connections` prop / ConnectionPool). Detach is a
    // genuinely unbacked action (no server-side detach-vs-disconnect
    // distinction exists yet) — rendered disabled, recorded as a wire gap.
  },
  {
    id: 'relays',
    label: 'Relays',
    group: 'Agents',
    backing: 'unbacked',
    gap: 'No relay registry route exists. Federation runs through the session backend (clio-agent P2), and no client method lists or edits relay hosts.',
  },
  { id: 'commands', label: 'Commands', group: 'Agents', backing: 'backend', method: 'commands()', built: true },
  { id: 'prompts', label: 'Prompts', group: 'Agents', backing: 'backend', method: 'prompts()', built: true },
  {
    id: 'blueprints',
    label: 'Agent blueprints',
    group: 'Agents',
    backing: 'backend',
    method: 'agentBlueprints()',
    built: true,
  },
  {
    id: 'expert-packs',
    label: 'Expert packs',
    group: 'Agents',
    backing: 'backend',
    method: 'expertPacks()',
    built: true,
  },
  { id: 'mcp', label: 'MCP servers', group: 'Agents', backing: 'backend', method: 'mcpServers()', built: true },

  // ---- Telemetry ----
  { id: 'hooks', label: 'Hooks', group: 'Telemetry', backing: 'backend', method: 'hooks()', built: true },
  {
    id: 'policies',
    label: 'Policies',
    group: 'Telemetry',
    backing: 'backend',
    method: 'policies() / putPolicies()',
    built: true,
  },
  {
    id: 'memory',
    label: 'Memory',
    group: 'Telemetry',
    backing: 'backend',
    method: 'memoryStats()',
    built: true,
  },
  { id: 'metrics', label: 'Metrics', group: 'Telemetry', backing: 'backend', method: 'metrics()', built: true },
  {
    id: 'doctor',
    label: 'Doctor',
    group: 'Telemetry',
    backing: 'backend',
    method: 'health() / capabilities() / lspClients()',
    built: true,
  },

  // ---- App ----
  {
    id: 'plugins',
    label: 'Plugins',
    group: 'App',
    backing: 'client',
    built: true,
    // wire/plugins.ts is a complete localStorage-backed registry
    // (listPlugins/savePlugin/removePlugin); only invokePlugin needs the
    // Tauri desktop shell. The page was wrongly marked unbacked — the
    // module existed and was simply never wired to a nav entry.
  },
  { id: 'appearance', label: 'Appearance', group: 'App', backing: 'client', built: true },
  {
    id: 'data',
    label: 'Data & backups',
    group: 'App',
    backing: 'client',
    built: true,
    // wire/settings-export.ts (downloadSettings/importSettings) is a
    // complete, working localStorage export/import — the same "client"
    // backing category as Backends/Appearance, not unbacked.
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

/** Uppercase rail section labels, verbatim prototype order. */
export const GROUP_LABELS: Record<SettingsPage['group'], string> = {
  Connection: 'CONNECTION',
  Agents: 'AGENTS',
  Telemetry: 'TELEMETRY',
  App: 'APP',
};
