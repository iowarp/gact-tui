import { useState } from 'react';
import { brand } from '@brand';
import { ContextMenu, Eyebrow, InlineEdit, ToolbarButton, type MenuItemDef } from '../kit';
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

export type SessionAction = 'rename' | 'fork' | 'export' | 'share' | 'pin' | 'delete';

/**
 * Session actions the prototype offers.
 *
 * `backing` distinguishes what the BACKEND must serve from what the client
 * owns outright. Pinning is UI organisation — it is not backend vocabulary and
 * needs no endpoint, exactly like appearance or the connection registry.
 *
 * An action that needs the backend and has no method renders in the error tone
 * rather than disappearing: the gap stays visible in the product, and carries
 * an issue against clio-agent.
 */
export const SESSION_ACTIONS: Array<{
  id: SessionAction;
  label: string;
  /** The client method that serves it, when the backend must. */
  method?: string;
  /** Owned entirely by the client — no endpoint expected. */
  client?: boolean;
  /** Why it cannot work yet, when neither of the above holds. */
  issue?: string;
}> = [
  { id: 'rename', label: 'Rename', method: 'patchSession()' },
  { id: 'fork', label: 'Fork', method: 'forkSession()' },
  { id: 'export', label: 'Export', method: 'exportSession()' },
  { id: 'share', label: 'Share', method: 'shareSession()' },
  { id: 'pin', label: 'Pin', client: true },
  { id: 'delete', label: 'Delete', method: 'deleteSession()' },
];

export interface RailProps {
  groups: RailGroup[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCollapse: () => void;
  onSessionAction?: (sessionId: string, action: SessionAction) => void;
  /** Supplying this enables rename-in-place from the row menu. */
  onRenameSession?: (sessionId: string, title: string) => void;
}

/**
 * The workspace/session rail — geometry transcribed from the prototype, which
 * is a crafted design rather than a starting point.
 */
export function Rail({
  groups,
  activeSessionId,
  onSelectSession,
  onCollapse,
  onSessionAction,
  onRenameSession,
}: RailProps) {
  const [menu, setMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  function openMenu(event: React.MouseEvent, sessionId: string) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ sessionId, x: event.clientX, y: event.clientY });
  }

  const items: MenuItemDef[] = SESSION_ACTIONS.filter(
    // Offering an action the surface cannot perform promises something that
    // does nothing when clicked.
    (action) => action.id !== 'rename' || onRenameSession !== undefined,
  ).map((action) => ({
    id: action.id,
    label: action.label,
    // Unsupported actions are shown in the destructive tone — visible, not
    // silently absent — and cannot be invoked.
    ...(action.issue ? { tone: 'danger' as const, disabled: true } : {}),
    ...(action.id === 'delete' ? { tone: 'danger' as const } : {}),
  }));

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

      <div className="shell-rail__heading">
        <Eyebrow strong>workspaces</Eyebrow>
      </div>

      <nav className="shell-rail__body" aria-label="Workspaces">
        {groups.map((group) => (
          <section className="shell-rail__group" key={group.id}>
            <div className="shell-rail__grouphead">
              <span className="shell-rail__grouplabel">{group.label}</span>
              <span className="shell-rail__groupcount">{group.count}</span>
            </div>

            {group.sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className="shell-rail__session"
                  role="button"
                  tabIndex={0}
                  aria-label={session.title}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectSession(session.id)}
                  onContextMenu={(e) => openMenu(e, session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSession(session.id);
                    }
                  }}
                >
                  <StatusDot status={session.status} />
                  <div className="shell-rail__row">
                    {renamingId === session.id && onRenameSession ? (
                      <InlineEdit
                        value={session.title}
                        label="Session name"
                        size="rail"
                        startEditing
                        onCancel={() => setRenamingId(null)}
                        onCommit={(next) => {
                          setRenamingId(null);
                          onRenameSession(session.id, next);
                        }}
                      />
                    ) : (
                      <span className="shell-rail__title">{session.title}</span>
                    )}
                    <span className="shell-rail__status">{session.status}</span>
                    <span className="shell-rail__age">{session.age}</span>
                    <button
                      type="button"
                      className="shell-rail__menu"
                      aria-label={`Actions for ${session.title}`}
                      onClick={(e) => openMenu(e, session.id)}
                    >
                      <MenuGlyph />
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </nav>

      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={items}
        label="Session actions"
        onSelect={(id) => {
          if (!menu) return;
          if (id === 'rename') {
            setRenamingId(menu.sessionId);
            return;
          }
          onSessionAction?.(menu.sessionId, id as SessionAction);
        }}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function MenuGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="9.5" cy="6" r="1" fill="currentColor" />
    </svg>
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
