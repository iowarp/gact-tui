/**
 * UI component: Icon Glyphs.
 */
import { ACTION_ICON_GLYPHS } from './IconGlyphsActions.js';
import { NAVIGATION_ICON_GLYPHS } from './IconGlyphsNavigation.js';
import { OBJECT_ICON_GLYPHS } from './IconGlyphsObjects.js';
import type { IconGlyphFactory, IconName } from './IconTypes.js';

export type { IconName } from './IconTypes.js';

/**
 * Icon glyphs as FACTORY FUNCTIONS, not pre-instantiated JSX elements.
 *
 * A module-level `<path>`/`<>...</>` element is a single DOM-node instance.
 * SolidJS inserts a given node reference into exactly one place, so returning
 * a fresh tree per call gives every render site its own nodes.
 */
export const ICON_GLYPHS = {
  ...NAVIGATION_ICON_GLYPHS,
  ...ACTION_ICON_GLYPHS,
  ...OBJECT_ICON_GLYPHS,
} satisfies Record<IconName, IconGlyphFactory>;
