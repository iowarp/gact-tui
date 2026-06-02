/**
 * Native menu → app action dispatch (1.0 item 9, JS half).
 *
 * The Rust menu (src-tauri/src/menu.rs) emits `clio:menu` events with one
 * of the action ids below. ChatLayout subscribes via `onMenuAction` and
 * routes each id to the same handler its keyboard shortcut uses, so menu
 * items and keybinds can never drift apart.
 */
import type { MenuAction } from './tauri.js';

export interface MenuActionHandlers {
  newSession?: () => void;
  importSession?: () => void;
  exportSession?: () => void;
  openSettings?: () => void;
  toggleInspector?: () => void;
  toggleSessions?: () => void;
  cycleDensity?: () => void;
  commandPalette?: () => void;
  keyboardShortcuts?: () => void;
  /** Rust toggles real fullscreen natively; this only syncs UI chrome. */
  fullscreen?: () => void;
  helpDocs?: () => void;
  about?: () => void;
}

/** Every action id the Rust MENU_SPEC can emit — the unit test asserts
 * this list against the Rust source so the two sides stay in lockstep. */
export const ALL_MENU_ACTIONS: readonly MenuAction[] = [
  'new-session',
  'import-session',
  'export-session',
  'open-settings',
  'toggle-inspector',
  'toggle-sessions',
  'cycle-density',
  'command-palette',
  'keyboard-shortcuts',
  'fullscreen',
  'help-docs',
  'about',
];

/**
 * Routes a native menu action to its handler. Returns true when a handler
 * existed and ran; false for unknown actions or missing handlers (so
 * callers can log dropped actions instead of failing silently).
 */
export function dispatchMenuAction(
  action: string,
  handlers: MenuActionHandlers,
): boolean {
  const run = (fn?: () => void): boolean => {
    if (!fn) return false;
    fn();
    return true;
  };
  switch (action as MenuAction) {
    case 'new-session':
      return run(handlers.newSession);
    case 'import-session':
      return run(handlers.importSession);
    case 'export-session':
      return run(handlers.exportSession);
    case 'open-settings':
      return run(handlers.openSettings);
    case 'toggle-inspector':
      return run(handlers.toggleInspector);
    case 'toggle-sessions':
      return run(handlers.toggleSessions);
    case 'cycle-density':
      return run(handlers.cycleDensity);
    case 'command-palette':
      return run(handlers.commandPalette);
    case 'keyboard-shortcuts':
      return run(handlers.keyboardShortcuts);
    case 'fullscreen':
      return run(handlers.fullscreen);
    case 'help-docs':
      return run(handlers.helpDocs);
    case 'about':
      return run(handlers.about);
    default:
      return false;
  }
}
