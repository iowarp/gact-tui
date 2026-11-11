const QUIET_FOCUS = 'quietFocus';

/**
 * Returns focus to a control without popping its hover name, as when a closed
 * overlay hands focus back to the control that opened it.
 */
export function focusQuietly(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.dataset[QUIET_FOCUS] = 'true';
  try {
    element.focus();
  } finally {
    delete element.dataset[QUIET_FOCUS];
  }
}

/** Whether focus is arriving through {@link focusQuietly}. */
export function focusIsQuiet() {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.dataset[QUIET_FOCUS] === 'true';
}

const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
let lastNavKeyAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'keydown',
    (event) => {
      lastNavKeyAt = NAV_KEYS.has(event.key) ? Date.now() : 0;
    },
    true,
  );
  document.addEventListener('pointerdown', () => (lastNavKeyAt = 0), true);
}

/**
 * Whether a focus change may raise a hover name: only when the person moved
 * focus with navigation keys on a fine pointer. Focus restored after Esc, a
 * closed dialog or sheet, and focus on touch widths stay quiet, so a name never
 * sits over the surface that just opened.
 */
export function focusMayRaiseName() {
  if (focusIsQuiet()) return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return false;
  return Date.now() - lastNavKeyAt < 1000;
}
