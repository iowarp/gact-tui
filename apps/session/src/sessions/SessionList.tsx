import type { ConnectedBackend } from '../backend/connection';
import './sessions.css';

export interface SessionListProps {
  backend: ConnectedBackend;
}

/**
 * The landing view after a successful handshake.
 *
 * Intentionally minimal: P4.R proves the app reaches a live backend and can
 * name what it found. The real rail/topbar/ribbon shell is gact-tui#332 and
 * composes from the component kit (#331) — this is NOT the shell, and must
 * not grow into one.
 */
export function SessionList({ backend }: SessionListProps) {
  return (
    <main className="sessions">
      <header className="sessions__head">
        <span className="sessions__label">Connected</span>
        <span className="sessions__url" data-testid="connected-backend">
          {backend.url}
        </span>
        <span className="sessions__meta">
          {backend.capabilities.backend.name} · contract {backend.capabilities.contract_version}
        </span>
      </header>

      {backend.sessions.length === 0 ? (
        <p className="sessions__empty" data-testid="sessions-empty">
          No sessions on this backend yet.
        </p>
      ) : (
        <ul className="sessions__list">
          {backend.sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="sessions__row"
                data-testid={`session-row-${session.id}`}
              >
                <span className="sessions__title">{session.title}</span>
                <span className="sessions__status">{session.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
