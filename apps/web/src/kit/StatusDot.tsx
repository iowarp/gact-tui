import './statusdot.css';

/**
 * `'ok'` is not a session lifecycle state (a session never sits at "ok") —
 * it is the steady, non-pulsing green the prototype uses for a static
 * connectivity indicator (rail footer's "agents"/"relay" cells: a plain
 * `background:var(--t-ok)` dot, no `clio-pulse` class). Kept in the same
 * union so every dot in the shell shares one vocabulary/CSS surface instead
 * of a second dot primitive existing solely for footer cells.
 */
export type SessionStatus = 'running' | 'idle' | 'error' | 'queued' | 'ok';

export interface StatusDotProps {
  status: SessionStatus;
  /** Keep the active-state glow but suppress its pulse. */
  quiet?: boolean;
}

/**
 * The shared status indicator used by every shell surface.
 *
 * The dot is decorative: callers also state status in text or through the
 * surrounding control, so colour is never the only accessible channel.
 */
export function StatusDot({ status, quiet = false }: StatusDotProps) {
  return (
    <span
      className="kit-statusdot"
      data-state={status}
      data-quiet={quiet ? 'true' : undefined}
      aria-hidden="true"
    />
  );
}
