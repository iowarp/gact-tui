import './statusdot.css';

export type SessionStatus = 'running' | 'idle' | 'error' | 'queued';

export interface StatusDotProps {
  status: SessionStatus;
}

/**
 * The 7px session status dot.
 *
 * Rendered `aria-hidden` on purpose: the dot is decoration, and every caller
 * pairs it with the status as TEXT. A 7px colour difference is not a status
 * indicator for a colour-blind user and does not exist at all for assistive
 * tech — so the colour is the redundant channel here, not the primary one.
 */
export function StatusDot({ status }: StatusDotProps) {
  return <span className="shell-statusdot" data-status={status} aria-hidden="true" />;
}
