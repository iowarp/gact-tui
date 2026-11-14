/**
 * A capture of a surface must show its viewers, not their "loads when it scrolls into
 * view" placeholders. A gated viewer that has not mounted marks its frame deferred;
 * a capture asks those frames to mount for its duration and releases them after.
 */
export const VIEWER_CAPTURE_MOUNT = 'clio:viewer-capture-mount';
export const VIEWER_CAPTURE_RELEASE = 'clio:viewer-capture-release';
/** On a gate's frame while its viewer is not mounted because it is off screen. */
export const VIEWER_DEFERRED_ATTRIBUTE = 'data-viewer-deferred';

function gates(target: HTMLElement): HTMLElement[] {
  return [
    ...(target.matches('[data-slot="viewer-file-gate"]') ? [target] : []),
    ...target.querySelectorAll<HTMLElement>('[data-slot="viewer-file-gate"]'),
  ];
}

/** Mount every gated viewer inside `target` while `work` runs, then release them. */
export async function withGatedViewersMounted<T>(
  target: HTMLElement,
  work: () => Promise<T>,
): Promise<T> {
  const held = gates(target);
  for (const gate of held) gate.dispatchEvent(new Event(VIEWER_CAPTURE_MOUNT));
  try {
    return await work();
  } finally {
    for (const gate of held) gate.dispatchEvent(new Event(VIEWER_CAPTURE_RELEASE));
  }
}
