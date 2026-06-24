/**
 * Builds the ChatLayout keydown handler that routes keyboard shortcuts to
 * their actions. Exports {@link createChatLayoutKeydownHandler}.
 */
import { cycleDensity } from './chatScreenUtils.js';
import { selectAdjacentSession } from './chatLayoutSessionNavigation.js';
import type { ChatLayoutShortcutsOptions } from './chatLayoutShortcutTypes.js';
import { copyTranscript } from './chatLayoutTranscriptClipboard.js';

export function createChatLayoutKeydownHandler(options: ChatLayoutShortcutsOptions) {
  return (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
      event.preventDefault();
      cycleDensity(options.density(), options.setDensity);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (event.shiftKey) {
        options.setCatalogOpen((open) => !open);
      } else {
        options.setPaletteOpen((open) => !open);
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      options.setComposeOpen((open) => !open);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      options.setSharedSessionOpen((open) => !open);
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'r' &&
      options.onRefreshSessions
    ) {
      event.preventDefault();
      void options.onRefreshSessions();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'e' &&
      options.onEditMessage
    ) {
      const lastUser = [...options.messages()].reverse().find((message) => message.role === 'user');
      if (lastUser) {
        event.preventDefault();
        void options.onEditMessage(lastUser);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      copyTranscript(options.messages());
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      options.onWalkAway?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      options.setCheatsheetOpen((open) => !open);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && options.onChat()) {
      event.preventDefault();
      if (event.shiftKey) {
        options.setServerSearchOpen((open) => !open);
      } else {
        options.transcriptSearch.setOpen(true);
        options.transcriptSearch.setCurrentIndex(0);
      }
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 's' &&
      options.onChat() &&
      options.activeId()
    ) {
      event.preventDefault();
      if (event.shiftKey) {
        if (options.onForkSession) void options.onForkSession(options.activeId());
      } else if (options.onExportSession) {
        void options.onExportSession(options.activeId());
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      options.onOpenSettings?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i' && options.onChat()) {
      event.preventDefault();
      options.setInspectorOpen((open) => !open);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && options.onChat()) {
      event.preventDefault();
      options.openSessionSemanticsPicker();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 's' &&
      options.activeId() &&
      options.onForkSession
    ) {
      event.preventDefault();
      void options.onForkSession(options.activeId());
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      options.openSessionSemanticsPicker();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      options.onChat() &&
      options.sessions().length > 1
    ) {
      event.preventDefault();
      selectAdjacentSession(event.key, options);
      return;
    }
    if (event.key === 'Escape' && options.paletteOpen()) {
      options.setPaletteOpen(false);
      return;
    }
    if (
      event.key === 'Escape' &&
      !options.paletteOpen() &&
      !options.cheatsheetOpen() &&
      !options.transcriptSearch.open() &&
      options.streaming() &&
      options.onStop &&
      options.onChat()
    ) {
      event.preventDefault();
      void options.onStop();
    }
  };
}
