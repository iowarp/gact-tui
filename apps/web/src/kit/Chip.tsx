import type { ReactNode } from 'react';
import './chip.css';

export type ChipTone = 'default' | 'accent' | 'warn' | 'error';

export interface ChipProps {
  children: ReactNode;
  icon?: ReactNode;
  tone?: ChipTone;
  /** Supplying a handler makes this a real <button>; otherwise it is text. */
  onClick?: () => void;
  title?: string;
}

/**
 * The chip — run handles, artifact refs, host/placement stamps, context
 * readouts (`ares:/scratch/j4471`, `async 2`, `ctx 41%`).
 *
 * Geometry from the prototype: --t-sf2 fill, --t-bd35 hairline, 6px radius,
 * 2px/9px padding, mono 11.5px, never wrapping.
 *
 * A chip that does nothing renders as a <span>. Only an acting chip becomes a
 * button — so assistive tech is never told about a control that isn't one.
 */
export function Chip({ children, icon, tone = 'default', onClick, title }: ChipProps) {
  const content = (
    <>
      {icon ? (
        <span className="kit-chip__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );

  if (!onClick) {
    return (
      <span className="kit-chip" data-tone={tone} title={title}>
        {content}
      </span>
    );
  }

  return (
    <button type="button" className="kit-chip" data-tone={tone} title={title} onClick={onClick}>
      {content}
    </button>
  );
}
