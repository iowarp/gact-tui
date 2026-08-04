import { createContext, useContext, useState, type ReactNode } from 'react';
import { brand } from '@brand';
import {
  ContextMenu,
  Eyebrow,
  Icon,
  InlineEdit,
  StatusDot,
  ToolbarButton,
  type MenuItemDef,
  type SessionStatus,
} from '../kit';
import { Lockup } from './Lockup';
import './rail.css';

export interface RailSession {
  id: string;
  title: string;
  status: SessionStatus;
  /** Relative age, already formatted ("now", "4m", "8d"). */
  age: string;
  /** UI organisation only — pin is not backend vocabulary. */
  pinned?: boolean;
}

export interface RailGroup {
  id: string;
  label: string;
  count: number;
  sessions: RailSession[];
}

/** Sessions shown per group before the prototype's "show more (N)" kicks in. */
const GROUP_VISIBLE = 5;

/** One connected (or refused) clio deployment. */
export interface RailConnection {
  id: string;
  label: string;
  url: string;
  status: 'ready' | 'refused' | 'error';
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
  onNewSession?: (workspaceId?: string) => void;
  onOpenSearch?: () => void;
  onSessionAction?: (sessionId: string, action: SessionAction) => void;
  /** Supplying this enables rename-in-place from the row menu. */
  onRenameSession?: (sessionId: string, title: string) => void;
  /** Live agent count for the footer band. Superseded by `connections`. */
  agentCount?: number;
  /**
   * Connected clio deployments the user can swap between (one local, one on
   * ares, ...). UI-owned vocabulary, like pin — never /v1/agents, which is the
   * expert registry and a different thing entirely.
   */
  connections?: RailConnection[];
  activeConnectionId?: string;
  onSwitchConnection?: (id: string) => void;
  onOpenSettings?: () => void;
}

interface RailActions {
  onNewSession?: (workspaceId?: string) => void;
  onSessionAction?: (sessionId: string, action: SessionAction) => void;
}

const RailActionsContext = createContext<RailActions>({});

export interface RailActionsProviderProps extends RailActions {
  children: ReactNode;
}

/**
 * Supplies connected-view rail actions without widening AppShell's public
 * layout contract. Explicit Rail props still take precedence.
 */
export function RailActionsProvider({
  children,
  onNewSession,
  onSessionAction,
}: RailActionsProviderProps) {
  return (
    <RailActionsContext.Provider value={{ onNewSession, onSessionAction }}>
      {children}
    </RailActionsContext.Provider>
  );
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
  onNewSession,
  onOpenSearch,
  onSessionAction,
  onRenameSession,
  agentCount,
  connections,
  activeConnectionId,
  onSwitchConnection,
  onOpenSettings,
}: RailProps) {
  const contextualActions = useContext(RailActionsContext);
  const newSession = onNewSession ?? contextualActions.onNewSession;
  const sessionAction = onSessionAction ?? contextualActions.onSessionAction;
  const [menu, setMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(
    null,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsAt, setConnectionsAt] = useState({ x: 0, y: 0 });

  // Only READY connections are counted: a refused backend is known but cannot
  // serve, and counting it would overstate what the user can reach.
  const readyCount = connections
    ? connections.filter((c) => c.status === 'ready').length
    : (agentCount ?? 0);
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
        <Lockup brand={brand} />
        <span className="shell-rail__spacer" />
        <ToolbarButton
          label="Collapse sessions"
          iconOnly
          size="small"
          icon={<Icon name="panel" />}
          onClick={onCollapse}
        />
      </div>

      <div className="shell-rail__heading">
        <Eyebrow strong>workspaces</Eyebrow>
        <span className="shell-rail__headingactions">
          <button
            type="button"
            className="shell-rail__headingbutton"
            aria-label="Search sessions"
            disabled={!onOpenSearch}
            onClick={() => onOpenSearch?.()}
          >
            <Icon name="search" />
          </button>
          <button
            type="button"
            className="shell-rail__headingbutton"
            aria-label="New session"
            disabled={!newSession}
            onClick={() => newSession?.()}
          >
            <Icon name="plus" size={11} />
          </button>
        </span>
      </div>

      <nav className="shell-rail__body" aria-label="Workspaces">
        <div className="shell-rail__list">
          {groups.map((group) => {
            const collapsed = collapsedGroups.includes(group.id);
            const expanded = expandedGroups.includes(group.id);
            // The prototype truncates a long group behind "show more (N)"; the
            // count is the point, since "show more" alone never says whether
            // one session is hidden or forty.
            // The prototype's ordering, verbatim: pinned first, then the rest,
            // each bucket keeping its incoming order. Truncation applies AFTER,
            // so a pinned session is never the one hidden behind "show more".
            const ordered = [
              ...group.sessions.filter((s) => s.pinned),
              ...group.sessions.filter((s) => !s.pinned),
            ];
            const truncated = !expanded && ordered.length > GROUP_VISIBLE;
            const shown = truncated ? ordered.slice(0, GROUP_VISIBLE) : ordered;
            const hidden = ordered.length - shown.length;

            return (
              <section className="shell-rail__group" key={group.id}>
                <div
                  className="shell-rail__grouphead"
                  data-testid={`rail-grouphead-${group.id}`}
                  onClick={() =>
                    setCollapsedGroups((cur) =>
                      cur.includes(group.id)
                        ? cur.filter((id) => id !== group.id)
                        : [...cur, group.id],
                    )
                  }
                >
                  <span
                    className="shell-rail__groupdisclose"
                    role="button"
                    tabIndex={0}
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
                    aria-expanded={!collapsed}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.currentTarget.click();
                    }}
                  >
                    <span aria-hidden="true">{'\u25b8'}</span>
                  </span>
                  <Icon name="folder" size={11} />
                  <span className="shell-rail__grouplabel">{group.label}</span>
                  <span className="shell-rail__groupcount">{group.count}</span>
                  <button
                    type="button"
                    className="shell-rail__groupmenu"
                    aria-label="Workspace menu"
                    onClick={(event) => {
                      event.stopPropagation();
                      const box = event.currentTarget.getBoundingClientRect();
                      setGroupMenu({ groupId: group.id, x: box.left, y: box.bottom });
                    }}
                  >
                    <Icon name="dots" />
                  </button>
                </div>

                {collapsed
                  ? null
                  : shown.map((session) => {
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
                            {session.pinned ? (
                              <span className="shell-rail__pin" aria-hidden="true">
                                <Icon name="pin" size={9} />
                              </span>
                            ) : null}
                            <span className="shell-rail__status">{session.status}</span>
                            <span className="shell-rail__age">{session.age}</span>
                            <button
                              type="button"
                              className="shell-rail__menu"
                              aria-label={`Session menu for ${session.title}`}
                              onClick={(e) => openMenu(e, session.id)}
                            >
                              <Icon name="dots" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                {collapsed || !truncated ? null : (
                  <button
                    type="button"
                    className="shell-rail__showmore"
                    data-testid={`rail-showmore-${group.id}`}
                    onClick={() => setExpandedGroups((cur) => [...cur, group.id])}
                  >
                    {`show more (${hidden})`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </nav>

      <div className="shell-rail__footer shell-rail__foot">
        <button
          type="button"
          className="shell-rail__footcell shell-rail__footcell--icon"
          aria-label="Settings"
          onClick={() => onOpenSettings?.()}
        >
          <Icon name="tool" size={14} />
        </button>
        <button
          type="button"
          className="shell-rail__footcell"
          data-testid="rail-connections"
          aria-haspopup="menu"
          aria-expanded={connectionsOpen}
          onClick={(event) => {
            if (!onSwitchConnection) return;
            const box = event.currentTarget.getBoundingClientRect();
            setConnectionsOpen((cur) => !cur);
            setConnectionsAt({ x: box.left, y: box.top });
          }}
        >
          <StatusDot status={readyCount > 0 ? 'running' : 'idle'} quiet />
          <span>agents </span>
          <span className="shell-rail__footcount">{readyCount}</span>
        </button>
        {/* Relay has no client method — shown disabled rather than hidden, so
            the capability gap is visible instead of silently missing. */}
        <button
          type="button"
          className="shell-rail__footcell"
          disabled
          title="Relay status is not served by this backend"
        >
          <StatusDot status="idle" quiet />
          <span>relay</span>
        </button>
      </div>

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
          sessionAction?.(menu.sessionId, id as SessionAction);
        }}
        onClose={() => setMenu(null)}
      />

      <ContextMenu
        open={groupMenu !== null}
        x={groupMenu?.x ?? 0}
        y={groupMenu?.y ?? 0}
        label="Workspace actions"
        items={[
          {
            id: 'new-session-here',
            label: 'New session here',
            disabled: !newSession,
          },
        ]}
        onSelect={() => {
          if (groupMenu) newSession?.(groupMenu.groupId);
        }}
        onClose={() => setGroupMenu(null)}
      />

      <ContextMenu
        open={connectionsOpen}
        x={connectionsAt.x}
        y={connectionsAt.y}
        label="Connected backends"
        items={(connections ?? []).map((connection) => ({
          id: connection.id,
          // A connection that refused is KEPT and shown with its state. A user
          // who added a backend needs to see why it will not serve them;
          // dropping it looks identical to losing the entry.
          label:
            connection.status === 'ready'
              ? connection.label
              : `${connection.label} — ${connection.status}`,
          ...(connection.status === 'ready' ? {} : { disabled: true, tone: 'danger' as const }),
          ...(connection.id === activeConnectionId ? { checked: true } : {}),
        }))}
        onSelect={(id) => {
          const chosen = (connections ?? []).find((c) => c.id === id);
          if (chosen?.status !== 'ready') return;
          onSwitchConnection?.(id);
        }}
        onClose={() => setConnectionsOpen(false)}
      />
    </div>
  );
}
