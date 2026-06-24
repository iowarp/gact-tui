/**
 * Solid hook that installs the ChatLayout keyboard shortcuts on mount and
 * tears them down on cleanup. Exports {@link useChatLayoutShortcuts}.
 */
import { onCleanup, onMount } from 'solid-js';
import { registerWindowKeydown } from '../domListeners.js';
import { dispatchMenuAction } from '../menu-actions.js';
import { onMenuAction } from '../tauri.js';
import { cycleDensity } from './chatScreenUtils.js';
import { createChatLayoutKeydownHandler } from './chatLayoutKeyboardHandlers.js';
import type { ChatLayoutShortcutsOptions } from './chatLayoutShortcutTypes.js';

export function useChatLayoutShortcuts(options: ChatLayoutShortcutsOptions) {
  onMount(() => {
    const onKey = createChatLayoutKeydownHandler(options);
    registerWindowKeydown(onKey, true);
  });

  onMount(() => {
    const unsub = onMenuAction((action) => {
      dispatchMenuAction(action, {
        newSession: options.openSessionSemanticsPicker,
        importSession: () => {
          options.setSessionsOpen(true);
          queueMicrotask(() => {
            (
              document.querySelector('[data-testid="sessions-import"]') as HTMLElement | null
            )?.click();
          });
        },
        exportSession: () => {
          if (options.activeId() && options.onExportSession) {
            void options.onExportSession(options.activeId());
          }
        },
        openSettings: () => options.onOpenSettings?.(),
        toggleInspector: () => options.setInspectorOpen((open) => !open),
        toggleSessions: () => options.setSessionsOpen((open) => !open),
        cycleDensity: () => cycleDensity(options.density(), options.setDensity),
        commandPalette: () => options.setPaletteOpen((open) => !open),
        keyboardShortcuts: () => options.setCheatsheetOpen((open) => !open),
        fullscreen: () => undefined,
        helpDocs: () => window.open('https://github.com/iowarp/clio-agent#readme', '_blank'),
        about: () => options.onOpenSettings?.('about'),
      });
    });
    onCleanup(unsub);
  });
}
