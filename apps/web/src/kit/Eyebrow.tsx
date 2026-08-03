import type { ReactNode } from 'react';
import './eyebrow.css';

export interface EyebrowProps {
  children: ReactNode;
  /** `.1em` is the prototype's default; `.08em` its tighter inline variant. */
  tight?: boolean;
}

/**
 * The mono small-caps label — 26 occurrences in the prototype, the most
 * repeated text treatment after body prose. It names sections, part kinds and
 * meta lanes.
 */
export function Eyebrow({ children, tight = false }: EyebrowProps) {
  return (
    <span className="kit-eyebrow" data-tight={tight ? 'true' : undefined}>
      {children}
    </span>
  );
}
