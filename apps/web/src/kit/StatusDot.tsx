import './statusdot.css';

export type SessionStatus = 'running' | 'idle' | 'error' | 'queued';

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
