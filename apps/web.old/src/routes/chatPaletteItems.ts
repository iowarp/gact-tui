/**
 * Assembles the full slash-palette command list from the per-category
 * builders. Exports {@link buildChatPaletteItems} and its input contract.
 */
import type { CapabilityFlags, SlashCommandDef } from '@clio/core';
import type { PermissionMode } from '../components/ComposerTypes.js';
import type { SlashCommand } from '../components/SlashPalette.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import type { DetachedSession } from '../detached.js';
import { frecencyVersion, rankByFrecency } from '../frecency.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import {
  capabilityActionItems,
  detachedSessionItems,
  permissionModeItems,
  pluginPaletteItems,
  railJumpItems,
  sessionJumpItems,
  settingsJumpItems,
  staticActionItems,
} from './chatPaletteItemBuilders.js';
import { mergedSlashCommands } from './chatScreenUtils.js';

export interface ChatPaletteItemsInput {
  slashCommands?: SlashCommandDef[];
  sessions: SessionRow[];
  detachedSessions?: DetachedSession[];
  permMode?: PermissionMode;
  capsFlags?: CapabilityFlags;
  activeId: string;
  density: TranscriptDensity;
}

export function buildChatPaletteItems(input: ChatPaletteItemsInput): SlashCommand[] {
  const items = mergedSlashCommands(input.slashCommands);

  items.push(
    ...sessionJumpItems(input.sessions),
    ...detachedSessionItems(input.detachedSessions, input.sessions),
    ...permissionModeItems(input.permMode),
    ...railJumpItems(),
    ...settingsJumpItems(),
    ...capabilityActionItems(input.capsFlags),
    ...pluginPaletteItems(),
    ...staticActionItems(input.activeId, input.density),
  );

  void frecencyVersion();
  const { ranked, recentIds } = rankByFrecency(items, (command) => command.id);
  return ranked.map((command) =>
    recentIds.has(command.id) ? { ...command, category: 'recent' } : command,
  );
}
