/**
 * Builds the action-category slash-palette items (permission modes, plugins,
 * capability-gated actions, static actions).
 */
import type { CapabilityFlags } from '@clio/core';
import type { PermissionMode } from '../components/ComposerTypes.js';
import type { SlashCommand } from '../components/SlashPalette.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import { listPlugins } from '../plugins.js';

export function permissionModeItems(currentMode?: PermissionMode): SlashCommand[] {
  const modes: PermissionMode[] = ['ask', 'auto-edits', 'plan', 'auto', 'bypass'];
  return modes
    .filter((mode) => mode !== currentMode)
    .map((mode) => ({
      id: `perm:${mode}`,
      trigger: `perm · ${mode}`,
      description: `Set permission mode to ${mode}`,
      category: 'perm',
    }));
}

export function pluginPaletteItems(): SlashCommand[] {
  return listPlugins()
    .filter((plugin) => plugin.trigger)
    .map((plugin) => ({
      id: `plugin:${plugin.id}`,
      trigger: plugin.trigger!,
      description: plugin.description ?? `Run ${plugin.name}`,
      category: 'action',
    }));
}

export function capabilityActionItems(capsFlags?: CapabilityFlags): SlashCommand[] {
  return [
    ...(capsFlags?.session_summary
      ? [
          {
            id: 'summarize-with-instructions',
            trigger: 'summarize · custom',
            description:
              'Summarize the session with custom instructions (e.g. "extract action items only")',
            category: 'action',
          },
        ]
      : []),
    ...(capsFlags?.skills_extraction
      ? [
          {
            id: 'extract-agent',
            trigger: 'extract · agent',
            description: 'Distill a new agent definition from this session (skills_extraction)',
            category: 'action',
          },
        ]
      : []),
    ...(capsFlags?.session_summary
      ? [
          {
            id: 'summarize',
            trigger: 'summarize session',
            description: 'Ask the backend to summarize this session',
            category: 'action',
          },
        ]
      : []),
  ];
}

export function staticActionItems(activeId: string, density: TranscriptDensity): SlashCommand[] {
  return [
    {
      id: 'compose-modal',
      trigger: 'compose · fullscreen',
      description: 'Open the fullscreen compose modal (Ctrl+G)',
      category: 'action',
    },
    {
      id: 'catalog-browser',
      trigger: 'catalog · all',
      description: 'Unified search across agents/tools/MCP/prompts (Ctrl+Shift+K)',
      category: 'navigation',
    },
    {
      id: 'open-shared-session',
      trigger: 'open · shared session',
      description: 'Open a clio: share token (Ctrl+L)',
      category: 'action',
    },
    {
      id: 'export-md',
      trigger: 'export · markdown',
      description: 'Download the active session as a .md file',
      category: 'action',
    },
    {
      id: 'walk-away',
      trigger: 'walk away',
      description: 'Park the active session in the detached registry (Ctrl+Shift+D)',
      category: 'action',
    },
    {
      id: 'new-session',
      trigger: 'new session',
      description: 'Start a fresh session (Ctrl+N)',
      category: 'action',
    },
    {
      id: 'undo-turn',
      trigger: 'undo last turn',
      description: 'Drop the most recent message from this session',
      category: 'action',
    },
    {
      id: 'compact-session',
      trigger: 'compact session',
      description: 'Collapse history into a summary to free context window',
      category: 'action',
    },
    {
      id: 'copy-session-id',
      trigger: 'copy session id',
      description: activeId ? `Copy ${activeId}` : 'No session selected',
      category: 'action',
    },
    {
      id: 'cycle-density',
      trigger: 'cycle density',
      description: `Toggle transcript density (now: ${density})`,
      category: 'view',
    },
    {
      id: 'toggle-inspector',
      trigger: 'toggle inspector',
      description: 'Show / hide the inspector drawer',
      category: 'view',
    },
  ];
}
