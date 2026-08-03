/**
 * Pure command-dispatch model: maps a command id to its {@link ChatCommandDispatch}
 * and decides whether using it should be recorded as recent.
 */
import type { PermissionMode } from '../components/ComposerTypes.js';
import type { RailRoute } from '../components/LeftRail.js';
import type { SettingsSection } from './SettingsShell.js';
import { DEFAULT_COMMAND_IDS } from './chatScreenUtils.js';

export type ChatCommandDispatch =
  | { kind: 'jump'; sessionId: string }
  | { kind: 'detached'; sessionId: string }
  | { kind: 'permission'; mode: PermissionMode }
  | { kind: 'rail'; route: RailRoute }
  | { kind: 'settings'; section: SettingsSection }
  | { kind: 'plugin'; id: string }
  | { kind: 'local'; id: string }
  | { kind: 'default'; id: string }
  | { kind: 'backend'; id: string };

const LOCAL_COMMAND_IDS = new Set([
  'new-session',
  'copy-session-id',
  'cycle-density',
  'summarize',
  'undo-turn',
  'compact-session',
  'toggle-inspector',
  'open-shared-session',
  'walk-away',
  'extract-agent',
  'summarize-with-instructions',
  'compose-modal',
  'export-md',
  'catalog-browser',
]);

export function shouldRecordCommandUse(commandId: string): boolean {
  return !commandId.startsWith('jump:') && !commandId.startsWith('detached:');
}

export function commandDispatchForId(commandId: string): ChatCommandDispatch {
  if (commandId.startsWith('jump:')) {
    return { kind: 'jump', sessionId: commandId.slice('jump:'.length) };
  }
  if (commandId.startsWith('detached:')) {
    return { kind: 'detached', sessionId: commandId.slice('detached:'.length) };
  }
  if (commandId.startsWith('perm:')) {
    return { kind: 'permission', mode: commandId.slice('perm:'.length) as PermissionMode };
  }
  if (commandId.startsWith('rail:')) {
    return { kind: 'rail', route: commandId.slice('rail:'.length) as RailRoute };
  }
  if (commandId.startsWith('settings:')) {
    return { kind: 'settings', section: commandId.slice('settings:'.length) as SettingsSection };
  }
  if (commandId.startsWith('plugin:')) {
    return { kind: 'plugin', id: commandId };
  }
  if (LOCAL_COMMAND_IDS.has(commandId)) {
    return { kind: 'local', id: commandId };
  }
  if (DEFAULT_COMMAND_IDS.has(commandId)) {
    return { kind: 'default', id: commandId };
  }
  return { kind: 'backend', id: commandId };
}
