/**
 * The spec's first fold: in the Settings window below 1024 px (rail or picker),
 * notes and ⓘ hints hide, then rows stack, before the nav folds. Dialogs portal
 * outside the window content, so they keep theirs.
 */
export const NARROW_HIDDEN = 'max-[1023px]:in-data-window-content:hidden';

/**
 * The spec's setting column (`.xrw{width:60%}`): 60% of the content column whenever
 * the window is unfolded (its narrowest content column, at 1024 px, is about 41rem),
 * and the full width once rows stack below 1024 px or in a narrower container.
 */
export const SETTINGS_COLUMN = '@xl:w-[60%] max-[1023px]:in-data-window-content:w-full!';
