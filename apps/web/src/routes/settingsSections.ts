/**
 * The settings navigation taxonomy: the {@link SettingsSection} union and the
 * ordered {@link SETTINGS_SECTIONS} definition list.
 */
import type { IconName } from '../components/Icon.js';

export type SettingsSection =
  | 'backends'
  | 'workspaces'
  | 'session-defaults'
  | 'models'
  | 'providers'
  | 'agents'
  | 'tools'
  | 'prompts'
  | 'blueprints'
  | 'expert-packs'
  | 'hooks'
  | 'policies'
  | 'mcp'
  | 'memory'
  | 'metrics'
  | 'doctor'
  | 'plugins'
  | 'appearance'
  | 'data'
  | 'about';

export interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: IconName;
  group: string;
}

export const SETTINGS_SECTIONS: SectionDef[] = [
  { id: 'backends', label: 'Backends', icon: 'mcp', group: 'Connection' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', group: 'Connection' },
  { id: 'session-defaults', label: 'Session defaults', icon: 'branch', group: 'Agents' },
  { id: 'models', label: 'Models', icon: 'sparkle', group: 'Agents' },
  { id: 'providers', label: 'Providers (advanced)', icon: 'plug', group: 'Agents' },
  { id: 'agents', label: 'Agents', icon: 'agents', group: 'Agents' },
  { id: 'tools', label: 'Commands', icon: 'tool', group: 'Agents' },
  { id: 'prompts', label: 'Prompts', icon: 'book', group: 'Agents' },
  { id: 'blueprints', label: 'Agent blueprints', icon: 'catalog', group: 'Agents' },
  { id: 'expert-packs', label: 'Expert packs', icon: 'sparkle', group: 'Agents' },
  { id: 'mcp', label: 'MCP servers', icon: 'mcp', group: 'Agents' },
  { id: 'hooks', label: 'Hooks', icon: 'tool', group: 'Telemetry' },
  { id: 'policies', label: 'Policies', icon: 'shield', group: 'Telemetry' },
  { id: 'memory', label: 'Memory', icon: 'memory', group: 'Telemetry' },
  { id: 'metrics', label: 'Metrics', icon: 'metrics', group: 'Telemetry' },
  { id: 'doctor', label: 'Doctor', icon: 'doctor', group: 'Telemetry' },
  { id: 'plugins', label: 'Plugins', icon: 'tool', group: 'App' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', group: 'App' },
  { id: 'data', label: 'Data & backups', icon: 'share', group: 'App' },
  { id: 'about', label: 'About', icon: 'help', group: 'App' },
];
