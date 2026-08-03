/**
 * Barrel re-export of the per-category palette item builders (action,
 * navigation, session) used to assemble the slash palette.
 */
export {
  capabilityActionItems,
  permissionModeItems,
  pluginPaletteItems,
  staticActionItems,
} from './chatPaletteActionItems.js';
export { railJumpItems, settingsJumpItems } from './chatPaletteNavigationItems.js';
export { detachedSessionItems, sessionJumpItems } from './chatPaletteSessionItems.js';
