import './skeleton.css';

export interface SkeletonProps {
  /**
   * The accessible name for the loading state — carried as `aria-label`
   * rather than visible text (gact-tui#366: a bare "Loading…" paragraph is
   * the thing this primitive replaces, not a pattern to repeat with a
   * shimmer behind it).
   */
  label: string;
  /**
   * Number of shimmer bars to render. A single short notice (the four
   * gact-tui#366 sites this replaces) wants one; a caller standing in for a
   * taller loading area can ask for more without a second primitive.
   */
  lines?: number;
}

/**
 * The one loading-state primitive in the kit (gact-tui#366) — replaces bare
 * `<p>Loading…</p>` text at every site that used it. Design tokens only (no
 * hardcoded colors): the shimmer sweeps between `--t-sf2` and `--t-hv`, the
 * same surface/hover pair every other kit primitive already draws from.
 */
export function Skeleton({ label, lines = 1 }: SkeletonProps) {
  return (
    <div className="kit-skeleton" role="status" aria-busy="true" aria-label={label} data-testid="kit-skeleton">
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <span key={i} className="kit-skeleton__bar" aria-hidden="true" />
      ))}
    </div>
  );
}
