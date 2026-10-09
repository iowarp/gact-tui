export interface ShowcaseBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ShowcaseGutter {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A showcase may occupy only unused space beside both the transcript and composer. */
export function showcaseGutter(
  surface: ShowcaseBounds,
  transcript: ShowcaseBounds,
  composer: ShowcaseBounds,
): ShowcaseGutter | undefined {
  const left = Math.max(transcript.right, composer.right) + 12;
  const width = Math.min(480, surface.right - left - 12);
  const height = surface.bottom - surface.top - 24;
  if (width < 280 || height < 240) return undefined;
  return { left, top: surface.top + 12, width, height };
}
