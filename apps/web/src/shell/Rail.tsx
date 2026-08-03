import { brand } from '@brand';
import { Eyebrow, ToolbarButton } from '../kit';
import { StatusDot, type SessionStatus } from './StatusDot';
import './rail.css';

export interface RailSession {
  id: string;
  title: string;
  status: SessionStatus;
  /** Relative age, already formatted ("now", "4m", "8d"). */
  age: string;
}

export interface RailGroup {
  id: string;
  label: string;
  count: number;
  sessions: RailSession[];
}

export interface RailProps {
  groups: RailGroup[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCollapse: () => void;
}

/**
 * The workspace/session rail — the prototype's left column.
 *
 * Composed entirely from kit primitives; it owns no dialog, menu or overlay of
 * its own. Geometry (the --t-sf fill, the --t-bd3 right border, the widths) is
 * the shell's; the rail only lays out rows.
 */
export function Rail({ groups, activeSessionId, onSelectSession, onCollapse }: RailProps) {
  return (
    <div className="shell-rail">
      <div className="shell-rail__brand">
        {brand.logoImage ? (
          <img className="shell-rail__logo" src={brand.logoImage} alt="" />
        ) : (
          <span className="shell-rail__mark" aria-hidden="true">
            {brand.markGlyph}
          </span>
        )}
        <span className="shell-rail__wordmark">{brand.wordmark}</span>
        <span className="shell-rail__spacer" />
        <ToolbarButton
          label="Collapse sessions"
          iconOnly
          size="small"
          icon={<CollapseIcon />}
          onClick={onCollapse}
        />
      </div>

      <nav className="shell-rail__body" aria-label="Workspaces">
        <div className="shell-rail__heading">
          <Eyebrow strong>workspaces</Eyebrow>
        </div>

        {groups.map((group) => (
          <section className="shell-rail__group" key={group.id}>
            <div className="shell-rail__grouphead">
              <span className="shell-rail__grouplabel">{group.label}</span>
              <span className="shell-rail__groupcount">{group.count}</span>
            </div>

            {group.sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  className="shell-rail__session"
                  // `aria-current` rather than a class alone, so the selection
                  // is exposed and not conveyed only by background colour.
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectSession(session.id)}
                >
                  <StatusDot status={session.status} />
                  <span className="shell-rail__title">{session.title}</span>
                  <span className="shell-rail__status">{session.status}</span>
                  <span className="shell-rail__age">{session.age}</span>
                </button>
              );
            })}
          </section>
        ))}
      </nav>
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 1.5v9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
