/**
 * Stable names the onboarding tour points at. Elements opt in with
 * `{...tourAnchor('composer')}`; the tour never targets CSS classes or
 * structure, so a restyle keeps working and a removed anchor falls back to a
 * centred card. `scripts/check_tour_anchors.mjs` fails when a name the script
 * uses is no longer placed anywhere in the source.
 */
export const TOUR_ANCHORS = [
  'composer',
  'workspace-navigation',
  'workbench-lists',
  'settings',
  'practice-conversation',
  'artifact-card',
  'interactive-surface',
  'tool-activity',
  'conversation-area',
  'model-picker',
  'reasoning-effort',
  'confirmation-policy',
  'add-context',
  'practice-artifact-viewer',
] as const;

export type TourAnchorId = (typeof TOUR_ANCHORS)[number];

export const TOUR_ANCHOR_ATTRIBUTE = 'data-tour';

export function tourAnchor(id: TourAnchorId): { 'data-tour': TourAnchorId } {
  return { 'data-tour': id };
}

/**
 * The most prominent element carrying `id` in `scope` (the scope itself
 * included): the one showing the largest area inside the viewport. One name may
 * sit on a panel and on the control that opens it; an open panel wins, and a
 * closed one falls back to its control. A panel parked mostly off screen (a
 * closed side panel's edge) loses to a control that is fully shown. With none
 * in view, the first laid-out one, for the caller to scroll to.
 */
export function findTourAnchor(
  id: TourAnchorId,
  scope: ParentNode = document,
): HTMLElement | undefined {
  const selector = `[${TOUR_ANCHOR_ATTRIBUTE}~="${id}"]`;
  const self = scope instanceof HTMLElement && scope.matches(selector) ? [scope] : [];
  const viewportArea = window.innerWidth * window.innerHeight;
  let best: HTMLElement | undefined;
  let shown: HTMLElement | undefined;
  let laidOut: HTMLElement | undefined;
  let bestArea = 0;
  let shownArea = 0;
  for (const element of [...self, ...scope.querySelectorAll<HTMLElement>(selector)]) {
    const rect = element.getBoundingClientRect();
    if (!laidOut && rect.width > 0 && rect.height > 0) laidOut = element;
    const width = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const area = width > 4 && height > 4 ? width * height : 0;
    if (area > bestArea) {
      best = element;
      bestArea = area;
    }
    const mostlyShown = area >= (rect.width * rect.height) / 2 || area >= viewportArea / 2;
    if (area > 0 && mostlyShown && area > shownArea) {
      shown = element;
      shownArea = area;
    }
  }
  return shown ?? best ?? laidOut;
}
