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
