/** Restore launcher focus unless the reader chose another control while closing. */
export function restoreEvidenceFocus(
  event: Event,
  launcher: HTMLElement | null,
  interactedOutside: boolean,
) {
  event.preventDefault();
  const focused = document.activeElement;
  // Radix dispatches this event in a timer after unmounting. A click on the
  // composer can land before that timer; the old panel must not steal it back.
  const movedOutside =
    focused !== null &&
    focused !== document.body &&
    focused !== document.documentElement &&
    event.target instanceof Node &&
    !event.target.contains(focused);
  if (!interactedOutside && !movedOutside) launcher?.focus();
}
