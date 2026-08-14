import '../kit/skeleton.css';
import './transcript.css';

/**
 * Message-shaped placeholder rows for the transcript's first paint
 * (gact-tui#369). Before this, a session click showed one generic
 * `<Skeleton label="Loading…" />` bar — no structure, nothing telling the
 * user "a conversation is about to appear here" — and then the WHOLE first
 * page (SessionView.load's `client.messages` call) committed in a single
 * flip. `load()` itself already paints the newest page the moment it
 * arrives (the `getSession`/`backfillOlder` calls run unawaited alongside
 * it, never blocking the first commit — verified, not touched here); the
 * gap this closes is purely presentational.
 *
 * Shapes mirror Transcript.tsx's real rows (`transcript.css`:
 * `.transcript__message[data-role='user']` is the right-aligned bubble,
 * `assistant` is the bare full-width flat log) so the swap from skeleton to
 * real content never jumps the layout. Built from the kit Skeleton
 * primitive's own shimmer-bar vocabulary (`.kit-skeleton__bar`,
 * `.kit-skeleton__srlabel`) rather than five stacked `<Skeleton>` instances
 * — each is `role="status"`/`aria-live`, and five identical "Loading…"
 * announcements queued at once would be a screen-reader regression, not an
 * improvement; ONE status region covers the whole area, matching the
 * kit primitive's own single-instance contract.
 */

interface SkeletonRow {
  role: 'user' | 'assistant';
  /** Shimmer-bar widths for this row's body, in px — varied so the rows
   *  read as prose lines of different lengths, not a uniform grid. */
  widths: number[];
}

const SKELETON_ROWS: SkeletonRow[] = [
  { role: 'user', widths: [180] },
  { role: 'assistant', widths: [420, 260] },
  { role: 'assistant', widths: [340] },
  { role: 'user', widths: [220] },
  { role: 'assistant', widths: [380, 180] },
];

export function TranscriptSkeleton() {
  return (
    <div className="transcript" data-testid="transcript-skeleton">
      <div className="transcript__column">
        <div
          className="transcript__skeleton-status"
          role="status"
          aria-busy="true"
          aria-label="Loading conversation…"
        >
          <span className="kit-skeleton__srlabel">Loading conversation…</span>
        </div>
        {SKELETON_ROWS.map((row, index) => (
          <div
            key={index}
            className="transcript__message transcript__message--skeleton"
            data-role={row.role}
            aria-hidden="true"
          >
            {row.widths.map((width, line) => (
              <span
                key={line}
                className="kit-skeleton__bar"
                style={{ maxWidth: `${width}px`, width: '100%' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
