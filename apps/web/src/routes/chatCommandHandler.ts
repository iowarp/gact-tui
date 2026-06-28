/**
 * Wires decoded slash-command dispatches to their handlers for ChatLayout.
 * Exports the command-handler factory and its options contract.
 */
import type { Accessor, Setter } from 'solid-js';
import type { PermissionMode } from '../components/ComposerTypes.js';
import type { RailRoute } from '../components/LeftRail.js';
import type { SlashCommand } from '../components/SlashPalette.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import { recordCommandUse } from '../frecency.js';
import { runBackendCommand, runPluginCommand } from './chatCommandExecution.js';
import {
  commandDispatchForId,
  shouldRecordCommandUse,
} from './chatCommandHandlerModel.js';
import { cycleDensity, routeSettingsSection } from './chatScreenUtils.js';
import type { SettingsSection } from './SettingsShell.js';

export interface ChatCommandHandlerOptions {
  activeId: Accessor<string>;
  density: Accessor<TranscriptDensity>;
  setDensity: (density: TranscriptDensity) => void;
  setPaletteOpen: Setter<boolean>;
  setRailRoute: Setter<RailRoute>;
  setInspectorOpen: Setter<boolean>;
  setSharedSessionOpen: Setter<boolean>;
  setComposeOpen: Setter<boolean>;
  setCatalogOpen: Setter<boolean>;
  openSessionSemanticsPicker: () => void;
  onSelect: (id: string) => void;
  onRefreshSessions?: () => void | Promise<void>;
  onReattachDetached?: (sessionId: string) => void;
  onPickPermMode?: (mode: PermissionMode) => void | Promise<void>;
  onOpenSettings?: (section?: SettingsSection) => void;
  onSummarize?: () => void | Promise<void>;
  onUndoTurn?: () => void | Promise<void>;
  onCompactSession?: () => void | Promise<void>;
  onWalkAway?: () => void;
  onExtractAgent?: () => void | Promise<void>;
  onSubmit?: (text: string) => Promise<void> | void;
  onSummarizeWithInstructions?: () => void | Promise<void>;
  onExportSession?: (id: string, format?: 'json' | 'md') => void | Promise<void>;
  onRunCommand?: (commandId: string, args: Record<string, unknown>) => Promise<unknown>;
}

export function createChatCommandHandler(
  options: ChatCommandHandlerOptions,
): (cmd: SlashCommand) => void {
  return (cmd) => {
    options.setPaletteOpen(false);

    const dispatch = commandDispatchForId(cmd.id);
    if (shouldRecordCommandUse(cmd.id)) {
      recordCommandUse(cmd.id);
    }

    if (dispatch.kind === 'jump') {
      options.onSelect(dispatch.sessionId);
      options.setRailRoute('sessions');
      return;
    }
    if (dispatch.kind === 'detached') {
      options.onSelect(dispatch.sessionId);
      options.setRailRoute('sessions');
      void options.onRefreshSessions?.();
      options.onReattachDetached?.(dispatch.sessionId);
      return;
    }
    if (dispatch.kind === 'permission') {
      void options.onPickPermMode?.(dispatch.mode);
      return;
    }
    if (dispatch.kind === 'rail') {
      if (dispatch.route === 'sessions') {
        options.setRailRoute('sessions');
        return;
      }
      options.onOpenSettings?.(routeSettingsSection(dispatch.route) ?? undefined);
      return;
    }
    if (dispatch.kind === 'settings') {
      options.onOpenSettings?.(dispatch.section);
      return;
    }
    if (cmd.id === 'new-session') {
      options.openSessionSemanticsPicker();
      return;
    }
    if (cmd.id === 'copy-session-id' && options.activeId()) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(options.activeId()).catch(() => undefined);
      }
      return;
    }
    if (cmd.id === 'cycle-density') {
      cycleDensity(options.density(), options.setDensity);
      return;
    }
    if (cmd.id === 'summarize') {
      void options.onSummarize?.();
      return;
    }
    if (cmd.id === 'undo-turn') {
      void options.onUndoTurn?.();
      return;
    }
    if (cmd.id === 'compact-session') {
      void options.onCompactSession?.();
      return;
    }
    if (cmd.id === 'toggle-inspector') {
      options.setInspectorOpen((open) => !open);
      return;
    }
    if (cmd.id === 'open-shared-session') {
      options.setSharedSessionOpen(true);
      return;
    }
    if (cmd.id === 'walk-away') {
      options.onWalkAway?.();
      return;
    }
    if (cmd.id === 'extract-agent') {
      void options.onExtractAgent?.();
      return;
    }
    if (dispatch.kind === 'plugin') {
      runPluginCommand(cmd, options);
      return;
    }
    if (cmd.id === 'summarize-with-instructions') {
      void options.onSummarizeWithInstructions?.();
      return;
    }
    if (cmd.id === 'compose-modal') {
      options.setComposeOpen(true);
      return;
    }
    if (cmd.id === 'export-md') {
      const activeId = options.activeId();
      if (activeId && options.onExportSession) {
        void options.onExportSession(activeId, 'md');
      }
      return;
    }
    if (cmd.id === 'catalog-browser') {
      options.setCatalogOpen(true);
      return;
    }

    if (dispatch.kind === 'backend') {
      runBackendCommand(cmd, options);
      return;
    }

    switch (cmd.trigger) {
      case '/settings':
        options.onOpenSettings?.();
        return;
      case '/sessions':
        options.setRailRoute('sessions');
        return;
      case '/agents':
        options.onOpenSettings?.('agents');
        return;
      case '/tools':
        options.onOpenSettings?.('tools');
        return;
      case '/doctor':
        options.onOpenSettings?.('doctor');
        return;
      case '/help':
      default:
        return;
    }
  };
}
