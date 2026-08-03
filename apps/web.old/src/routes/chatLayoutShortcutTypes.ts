/**
 * Options/type contract for the ChatLayout keyboard-shortcut handlers.
 */
import type { Accessor, Setter } from 'solid-js';
import type { Message } from '@clio/core';
import type { RailRoute } from '../components/LeftRail.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import type { SettingsSection } from './SettingsShell.js';
import type { TranscriptSearchController } from './chatTranscriptSearch.js';

export interface ChatLayoutShortcutsOptions {
  activeId: Accessor<string>;
  messages: Accessor<Message[]>;
  sessions: Accessor<SessionRow[]>;
  density: Accessor<TranscriptDensity>;
  streaming: Accessor<boolean | undefined>;
  onChat: Accessor<boolean>;
  paletteOpen: Accessor<boolean>;
  setPaletteOpen: Setter<boolean>;
  cheatsheetOpen: Accessor<boolean>;
  setCheatsheetOpen: Setter<boolean>;
  setCatalogOpen: Setter<boolean>;
  setComposeOpen: Setter<boolean>;
  setSharedSessionOpen: Setter<boolean>;
  setServerSearchOpen: Setter<boolean>;
  setInspectorOpen: Setter<boolean>;
  setSessionsOpen: Setter<boolean>;
  setRailRoute: Setter<RailRoute>;
  transcriptSearch: TranscriptSearchController;
  setDensity: (density: TranscriptDensity) => void;
  openSessionSemanticsPicker: () => void;
  onRefreshSessions?: () => void | Promise<void>;
  onEditMessage?: (msg: Message) => void;
  onWalkAway?: () => void;
  onForkSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string, format?: 'json' | 'md') => void | Promise<void>;
  onOpenSettings?: (section?: SettingsSection) => void;
  onSelect: (id: string) => void;
  onStop?: () => void | Promise<void>;
}
