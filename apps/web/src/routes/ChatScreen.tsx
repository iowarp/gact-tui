/**
 * Chat route entry: selects the live- or fixture-driven chat and provides
 * backend context. Exports {@link ChatScreen}.
 */
import type { BackendHandle } from '../App.js';
import { ChatFixtureDriven } from './ChatFixtureDriven.js';
import { ChatScreenLiveDriven } from './ChatScreenLiveDriven.js';
import { fixtureNameFromUrl } from './ChatScreenModel.js';
import './chat.css';

import type { SettingsContext, SettingsSection } from './SettingsShell.js';

export interface ChatScreenProps {
  backend: BackendHandle;
  onOpenSettings?: (section?: SettingsSection, context?: SettingsContext) => void;
  onAddRemote?: () => void;
}

export function ChatScreen(props: ChatScreenProps) {
  const fixtureName = fixtureNameFromUrl(window.location.href);

  if (fixtureName) {
    return (
      <ChatFixtureDriven
        backend={props.backend}
        fixture={fixtureName}
        onOpenSettings={props.onOpenSettings}
        onAddRemote={props.onAddRemote}
      />
    );
  }
  return (
    <ChatScreenLiveDriven
      backend={props.backend}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
    />
  );
}
