/*
 * Opening a conversation or expanding a list moves another row under a
 * pointer that never moved. Previews stay closed until the pointer really moves.
 */
let previewsHeldAt: { x: number; y: number } | null = null;

function releasePreviews(event: PointerEvent) {
  if (
    !previewsHeldAt ||
    Math.hypot(event.clientX - previewsHeldAt.x, event.clientY - previewsHeldAt.y) > 3
  ) {
    previewsHeldAt = null;
    window.removeEventListener('pointermove', releasePreviews);
  }
}

export function holdPreviews(x: number, y: number) {
  previewsHeldAt = { x, y };
  window.addEventListener('pointermove', releasePreviews);
}

export function previewsHeld() {
  return previewsHeldAt !== null;
}
