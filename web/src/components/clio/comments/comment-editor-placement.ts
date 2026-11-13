/**
 * Where the comment editor opens (FP-D6). It opens below its mark, kept on screen, but
 * never over the comment controls (the "Add N marks to message" tray): an editor that
 * would cover them moves to the tray's left, else above it, else below it.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

function onScreen(rect: Rect, viewport: { width: number; height: number }): Rect {
  return {
    ...rect,
    left: clamp(rect.left, GAP, Math.max(GAP, viewport.width - rect.width - GAP)),
    top: clamp(rect.top, GAP, Math.max(GAP, viewport.height - rect.height - GAP)),
  };
}

export function placeCommentEditor(
  desired: { left: number; top: number },
  size: { width: number; height: number },
  avoid: Rect | undefined,
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const first = onScreen({ ...desired, ...size }, viewport);
  if (!avoid || !overlaps(first, avoid)) return { left: first.left, top: first.top };
  const candidates: Rect[] = [
    { ...size, left: avoid.left - size.width - GAP, top: first.top },
    { ...size, left: first.left, top: avoid.top - size.height - GAP },
    { ...size, left: first.left, top: avoid.top + avoid.height + GAP },
  ];
  for (const candidate of candidates) {
    const fitted = onScreen(candidate, viewport);
    if (!overlaps(fitted, avoid)) return { left: fitted.left, top: fitted.top };
  }
  return { left: first.left, top: first.top };
}
