/**
 * Builds the navigation-category slash-palette items (rail jumps, settings
 * jumps).
 */
import type { RailRoute } from '../components/LeftRail.js';
import type { SlashCommand } from '../components/SlashPalette.js';
import type { SettingsSection } from './SettingsShell.js';

const RAIL_JUMPS: Array<{ id: RailRoute; label: string }> = [
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'agents', label: 'Agents' },
  { id: 'tools', label: 'Commands' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'mcp', label: 'MCP servers' },
  { id: 'memory', label: 'Memory' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'doctor', label: 'Doctor' },
];

export function railJumpItems(): SlashCommand[] {
  return RAIL_JUMPS.map((route) => ({
    id: `rail:${route.id}`,
    trigger: `go · ${route.label.toLowerCase()}`,
    description: `Open Settings → ${route.label}`,
    category: 'navigation',
  }));
}

const SETTINGS_JUMPS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'backends', label: 'Backends' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'models', label: 'Models' },
  { id: 'providers', label: 'Providers (advanced)' },
  { id: 'agents', label: 'Agents' },
  { id: 'mcp', label: 'MCP servers' },
  { id: 'memory', label: 'Memory' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

export function settingsJumpItems(): SlashCommand[] {
  return SETTINGS_JUMPS.map((setting) => ({
    id: `settings:${setting.id}`,
    trigger: `settings · ${setting.label.toLowerCase()}`,
    description: `Open Settings → ${setting.label}`,
    category: 'settings',
  }));
}
