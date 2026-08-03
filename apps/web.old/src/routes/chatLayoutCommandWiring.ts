/**
 * Assembles the ChatLayout command surface, binding the various action
 * factories and palette builders into one command-dispatch wiring.
 */
import type { Accessor, Setter } from 'solid-js';
import type { RailRoute } from '../components/LeftRail.js';
import { createChatCommandHandler } from './chatCommandHandler.js';
import { useChatLayoutShortcuts } from './chatLayoutShortcuts.js';
import type { TranscriptSearchController } from './chatTranscriptSearch.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export interface ChatLayoutCommandWiringOptions {
  props: ChatLayoutProps;
  onChat: Accessor<boolean>;
  paletteOpen: Accessor<boolean>;
  setPaletteOpen: Setter<boolean>;
  cheatsheetOpen: Accessor<boolean>;
  setCheatsheetOpen: Setter<boolean>;
  setCatalogOpen: Setter<boolean>;
  setComposeOpen: Setter<boolean>;
  setSharedSessionOpen: Setter<boolean>;
  setSessionSemanticsOpen: Setter<boolean>;
  setServerSearchOpen: Setter<boolean>;
  setInspectorOpen: Setter<boolean>;
  setSessionsOpen: Setter<boolean>;
  setRailRoute: Setter<RailRoute>;
  transcriptSearch: TranscriptSearchController;
}

export function createChatLayoutCommandWiring(options: ChatLayoutCommandWiringOptions) {
  const openSessionSemanticsPicker = () => {
    options.setSessionSemanticsOpen(true);
    void options.props.onRefreshSessionSemantics?.();
  };

  const handlePick = createChatCommandHandler({
    activeId: () => options.props.activeId,
    density: () => options.props.density,
    setDensity: options.props.setDensity,
    setPaletteOpen: options.setPaletteOpen,
    setRailRoute: options.setRailRoute,
    setInspectorOpen: options.setInspectorOpen,
    setSharedSessionOpen: options.setSharedSessionOpen,
    setComposeOpen: options.setComposeOpen,
    setCatalogOpen: options.setCatalogOpen,
    openSessionSemanticsPicker,
    onSelect: options.props.onSelect,
    onRefreshSessions: options.props.onRefreshSessions,
    onReattachDetached: options.props.onReattachDetached,
    onPickPermMode: options.props.onPickPermMode,
    onOpenSettings: options.props.onOpenSettings,
    onSummarize: options.props.onSummarize,
    onUndoTurn: options.props.onUndoTurn,
    onCompactSession: options.props.onCompactSession,
    onWalkAway: options.props.onWalkAway,
    onExtractAgent: options.props.onExtractAgent,
    onSubmit: options.props.onSubmit,
    onSummarizeWithInstructions: options.props.onSummarizeWithInstructions,
    onExportSession: options.props.onExportSession,
    onRunCommand: options.props.onRunCommand,
  });

  useChatLayoutShortcuts({
    activeId: () => options.props.activeId,
    messages: () => options.props.messages,
    sessions: () => options.props.sessions,
    density: () => options.props.density,
    streaming: () => options.props.streaming,
    onChat: options.onChat,
    paletteOpen: options.paletteOpen,
    setPaletteOpen: options.setPaletteOpen,
    cheatsheetOpen: options.cheatsheetOpen,
    setCheatsheetOpen: options.setCheatsheetOpen,
    setCatalogOpen: options.setCatalogOpen,
    setComposeOpen: options.setComposeOpen,
    setSharedSessionOpen: options.setSharedSessionOpen,
    setServerSearchOpen: options.setServerSearchOpen,
    setInspectorOpen: options.setInspectorOpen,
    setSessionsOpen: options.setSessionsOpen,
    setRailRoute: options.setRailRoute,
    transcriptSearch: options.transcriptSearch,
    setDensity: options.props.setDensity,
    openSessionSemanticsPicker,
    onRefreshSessions: options.props.onRefreshSessions,
    onEditMessage: options.props.onEditMessage,
    onWalkAway: options.props.onWalkAway,
    onForkSession: options.props.onForkSession,
    onExportSession: options.props.onExportSession,
    onOpenSettings: options.props.onOpenSettings,
    onSelect: options.props.onSelect,
    onStop: options.props.onStop,
  });

  return {
    openSessionSemanticsPicker,
    handlePick,
  };
}
