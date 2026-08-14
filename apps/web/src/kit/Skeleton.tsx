import './skeleton.css';

export interface SkeletonProps {
  /**
   * The loading label — carried BOTH ways (Opus adversarial review, fix #5):
   * as `aria-label` (`role="status"`'s accessible NAME is "Name from:
   * author" per the ARIA spec — it does NOT compute from content the way
   * most other roles do, verified directly: dropping aria-label in favor of
   * content-only left `toHaveAccessibleName` reading empty) AND as REAL
   * (visually hidden, `.kit-skeleton__srlabel`) text content, since a
   * live-region ANNOUNCEMENT — a screen reader speaking up when this
   * region's content changes — is a separate mechanism from the accessible
   * name and is driven by content changing, not reliably by the name alone.
   * The old bare `<p role="status">Loading…</p>` this primitive replaces
   * spoke because "Loading…" was real text content; relying on aria-label
   * alone would have been a plausible regression to a silent live region.
   * The shimmer bars stay `aria-hidden` — decorative, the label alone
   * carries the announcement.
   */
  label: string;
  /**
   * Number of shimmer bars to render. A single short notice (every
   * gact-tui#366 site this replaces) wants one; a caller standing in for a
   * taller loading area can ask for more without a second primitive.
   */
  lines?: number;
}

/**
 * The one loading-state primitive in the kit (gact-tui#366) — replaces every
 * bare `<p>Loading…</p>`-shaped text site in `apps/web/src` (originally four:
 * SessionView's transcript-loading notice, FilesLayer's workspace-file-
 * listing and single-file-preview states, settings' shared LoadingNote; an
 * Opus adversarial review found four more the first pass missed —
 * SessionView's observability-panel notice, AgentPeekView's child-loading
 * notice, and BlueprintWindow's file-listing and file-preview notices — all
 * now covered too; verified via a repo-wide grep before writing this
 * sentence, not asserted from memory). Design tokens only (no hardcoded
 * colors): the shimmer sweeps between `--t-sf2` and `--t-hv`, the same
 * surface/hover pair every other kit primitive already draws from.
 */
export function Skeleton({ label, lines = 1 }: SkeletonProps) {
  return (
    <div className="kit-skeleton" role="status" aria-busy="true" aria-label={label} data-testid="kit-skeleton">
      <span className="kit-skeleton__srlabel">{label}</span>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <span key={i} className="kit-skeleton__bar" aria-hidden="true" />
      ))}
    </div>
  );
}
