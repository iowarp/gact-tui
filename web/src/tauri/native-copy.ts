import { invoke } from '@tauri-apps/api/core';
import { ph, t } from '@lingui/core/macro';
import { i18n } from '@/i18n/instance';
import { INTERFACE_LANGUAGES, SOURCE_LOCALE } from '@/i18n/locales';
import { currentLocalePreference } from '@/i18n/runtime';
import { inTauri } from '@/lib/transport/tauri-runtime';

// Placeholders the desktop host fills in itself: the app's name, a folder and
// an error it reports. Passed as values so translators see `{name}` in place.
const NAME = '{name}';
const DEST = '{dest}';
const ERROR = '{error}';

/**
 * The desktop host's own strings (macOS menu bar, tray, the macOS "Move to
 * Applications" prompt) in the interface language. Keys and English text match
 * `desktop/src-tauri/src/native_copy.rs`, whose tests check that every key is
 * listed here.
 */
export function nativeCopy(): Record<string, string> {
  return {
    'menu.File': t({ message: 'File', context: 'menu bar' }),
    'menu.Edit': t({ message: 'Edit', context: 'menu bar' }),
    'menu.View': t({ message: 'View', context: 'menu bar' }),
    'menu.Agent': t({ message: 'Agent', context: 'menu bar' }),
    'menu.Window': t({ message: 'Window', context: 'menu bar' }),
    'menu.Help': t({ message: 'Help', context: 'menu bar' }),
    'menu.Add an Agent': t`Add an Agent`,
    'menu.item.about': t`About ${ph({ name: NAME })}`,
    'menu.item.open-settings': t`Settings…`,
    'menu.item.quit': t`Quit ${ph({ name: NAME })}`,
    'menu.item.new-session': t`New Conversation`,
    'menu.item.search': t`Search…`,
    'menu.item.toggle-left-bar': t`Toggle Left Bar`,
    'menu.item.toggle-workbench': t`Toggle Workbench`,
    'menu.item.reload': t`Reload`,
    'menu.item.zoom-reset': t`Actual Size`,
    'menu.item.zoom-in': t`Zoom In`,
    'menu.item.zoom-out': t`Zoom Out`,
    'menu.item.connection-settings': t`Connection Settings`,
    'menu.item.switch-agent': t`Switch To…`,
    'menu.item.manage-agents': t`Manage Agents`,
    'menu.item.connect-by-address': t`Connect by Address…`,
    'menu.item.manage-agent-services': t`Connect over SSH…`,
    'menu.item.install-agent': t`Install ${ph({ name: NAME })} on a Computer…`,
    'menu.item.open-infrastructure': t({ message: 'Infrastructure', context: 'menu bar' }),
    'menu.item.help-docs': t`Documentation`,
    'menu.item.keyboard-shortcuts': t`Keyboard Shortcuts`,
    'menu.predefined.undo': t({ message: 'Undo', context: 'menu bar' }),
    'menu.predefined.redo': t({ message: 'Redo', context: 'menu bar' }),
    'menu.predefined.cut': t({ message: 'Cut', context: 'menu bar' }),
    'menu.predefined.copy': t({ message: 'Copy', context: 'menu bar' }),
    'menu.predefined.paste': t({ message: 'Paste', context: 'menu bar' }),
    'menu.predefined.select_all': t`Select All`,
    'menu.predefined.hide': t`Hide ${ph({ name: NAME })}`,
    'menu.predefined.hide_others': t`Hide Others`,
    'menu.predefined.show_all': t`Show All`,
    'menu.predefined.minimize': t({ message: 'Minimize', context: 'menu bar' }),
    'menu.predefined.maximize': t({ message: 'Zoom', context: 'macOS window menu' }),
    'menu.predefined.fullscreen': t`Enter Full Screen`,
    'menu.predefined.close_window': t`Close Window`,
    'menu.predefined.bring_all_to_front': t`Bring All to Front`,
    'tray.show': t`Show ${ph({ name: NAME })}`,
    'tray.quit': t`Quit ${ph({ name: NAME })}`,
    'tray.tooltip': t`${ph({ name: NAME })}: running`,
    'move.title': t`Move ${ph({ name: NAME })} to Applications?`,
    'move.message.disk_image': t`${ph({ name: NAME })} is running from its disk image, so it cannot update itself or keep its place in the Dock.

Move it to ${ph({ dest: DEST })} now? ${ph({ name: NAME })} will reopen from there.`,
    'move.message.translocated': t`${ph({ name: NAME })} is running from a temporary location macOS uses for downloaded apps, so it cannot update itself or keep its place in the Dock.

Move it to ${ph({ dest: DEST })} now? ${ph({ name: NAME })} will reopen from there.`,
    'move.failed': t`${ph({ name: NAME })} could not be moved to ${ph({ dest: DEST })}: ${ph({ error: ERROR })}

Quit ${ph({ name: NAME })}, drag it into Applications in Finder, then open it from there.`,
    'move.confirm': t`Move to Applications`,
    'move.later': t`Not Now`,
  };
}

/**
 * The language the person picked in Settings, for the text macOS supplies
 * itself; `null` when the interface follows the system. A `?locale=` override
 * and the development pseudo-locale are not a choice to keep.
 */
export function chosenLanguage(preference = currentLocalePreference()): string | null {
  const language = INTERFACE_LANGUAGES.find((candidate) => candidate.locale === preference);
  return language && !language.development ? language.locale : null;
}

/**
 * Give the desktop host its strings in the active language. English is an empty
 * table: the host has the English text itself and keeps the operating system's
 * own text for standard menu items.
 */
export async function sendNativeCopy(): Promise<void> {
  if (!inTauri()) return;
  const copy = i18n.locale === SOURCE_LOCALE ? {} : nativeCopy();
  try {
    await invoke('set_native_copy', { copy, language: chosenLanguage() });
  } catch (error) {
    // An older desktop host without the command keeps its English menus.
    console.warn('The desktop menus could not be translated', error);
  }
}
