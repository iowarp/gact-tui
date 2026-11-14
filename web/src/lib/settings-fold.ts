/**
 * Notes and ⓘ hints stay with their label in the Settings window at every width:
 * a stacked row only moves its control under the label (V's gap audit, spec 16
 * step 1). Dialogs drop theirs once they become a bottom sheet below 600 px.
 */
export const NARROW_HIDDEN = 'max-[599px]:in-data-[slot=dialog-frame-body]:hidden';

/**
 * The spec's setting column (`.xrw{width:60%}`): 60% of the content column whenever
 * the window is unfolded (its narrowest content column, at 1024 px, is about 41rem),
 * and the full width once rows stack below 1024 px or in a narrower container.
 */
export const SETTINGS_COLUMN = '@xl:w-[60%] max-[1023px]:in-data-window-content:w-full!';

/**
 * A one-line `StateView size="row"` in a settings body: below 600 px (window or
 * sheet) it grows and wraps its sentence rather than cutting it off.
 */
export const ROW_STATE_WRAP =
  'max-[599px]:h-auto max-[599px]:min-h-7 max-[599px]:py-1 max-[599px]:whitespace-normal max-[599px]:[&>span>span]:whitespace-normal max-[599px]:[&>span>span]:[word-break:auto-phrase]';
