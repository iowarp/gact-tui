import type { ReactNode } from 'react';
import './partcard.css';

export interface PartCardProps {
  /** The 14px gutter slot — a kind marker, icon or rail glyph. */
  gutter?: ReactNode;
  children: ReactNode;
  /** Marks the frame for per-kind styling hooks without a bespoke class. */
  kind?: string;
}

/**
 * The part frame — the single most repeated structure in the prototype
 * (19 occurrences): a fixed 14px gutter, an 8px column gap, and a content
 * column that is allowed to shrink (`minmax(0,1fr)`, which is what keeps long
 * tool output from blowing out the transcript width).
 *
 * Every transcript part composes this. Nothing else should restate the grid.
 */
export function PartCard({ gutter, children, kind }: PartCardProps) {
  return (
    <div className="kit-partcard" data-kind={kind}>
      <div className="kit-partcard__gutter" aria-hidden={gutter ? undefined : true}>
        {gutter}
      </div>
      <div className="kit-partcard__body">{children}</div>
    </div>
  );
}
