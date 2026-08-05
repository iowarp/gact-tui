import { createContext, useContext, useState, type ReactNode } from 'react';
import { brand } from '@brand';
import type { RelayStatus } from '@clio/core';
import {
  ContextMenu,
  Eyebrow,
  Icon,
  InlineEdit,
  StatusDot,
  ToolbarButton,
  type IconName,
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
  /** UI organisation only; pinned groups render before unpinned groups. */
  pinned?: boolean;
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

export type SessionAction = 'pin' | 'rename' | 'delete';
export type WorkspaceAction = 'pin' | 'rename' | 'remove';

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
  icon: IconName;
  /** The client method that serves it, when the backend must. */
  method?: string;
  /** Owned entirely by the client — no endpoint expected. */
  client?: boolean;
  /** Why it cannot work yet, when neither of the above holds. */
  issue?: string;
}> = [
  { id: 'pin', label: 'pin', icon: 'pin', client: true },
  { id: 'rename', label: 'rename', icon: 'pencil', method: 'patchSession()' },
  { id: 'delete', label: 'delete', icon: 'trash', method: 'deleteSession()' },
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
  onWorkspaceAction?: (workspaceId: string, action: WorkspaceAction) => void;
  /** Supplying this enables workspace rename-in-place from the group menu. */
  onRenameWorkspace?: (workspaceId: string, name: string) => void;
  /** Supplying this proves that the files panel has a real opener. */
  onOpenWorkspaceFiles?: (workspaceId: string) => void;
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
  /** Opens the Settings layer. An optional `section` deep-links straight to
   *  a SETTINGS_PAGES id (e.g. `'relays'`) instead of landing on whatever
   *  page Settings opened to last — the prototype's `goSettingsRelays` /
   *  `goSettingsAgents` footer handlers each target their own page, not a
   *  shared generic "open settings" click. */
  onOpenSettings?: (section?: string) => void;
  /** This backend's own configured relay + a fresh reachability probe
   *  (GET /v1/relay/status, clio-agent#1179). `undefined` = not fetched yet
   *  (renders the same honest "unknown" idle dot as before the probe
   *  resolves, never a false-positive green). */
  relayStatus?: RelayStatus;
}

interface RailActions {
  onNewSession?: (workspaceId?: string) => void;
  onSessionAction?: (sessionId: string, action: SessionAction) => void;
  onWorkspaceAction?: (workspaceId: string, action: WorkspaceAction) => void;
  onRenameWorkspace?: (workspaceId: string, name: string) => void;
  onOpenWorkspaceFiles?: (workspaceId: string) => void;
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
  onWorkspaceAction,
  onRenameWorkspace,
  onOpenWorkspaceFiles,
}: RailActionsProviderProps) {
  return (
    <RailActionsContext.Provider
      value={{
        onNewSession,
        onSessionAction,
        onWorkspaceAction,
        onRenameWorkspace,
        onOpenWorkspaceFiles,
      }}
    >
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
  onWorkspaceAction,
  onRenameWorkspace,
  onOpenWorkspaceFiles,
  agentCount,
  connections,
  activeConnectionId,
  onSwitchConnection,
  onOpenSettings,
  relayStatus,
}: RailProps) {
  const contextualActions = useContext(RailActionsContext);
  const newSession = onNewSession ?? contextualActions.onNewSession;
  const sessionAction = onSessionAction ?? contextualActions.onSessionAction;
  const workspaceAction = onWorkspaceAction ?? contextualActions.onWorkspaceAction;
  const renameWorkspace = onRenameWorkspace ?? contextualActions.onRenameWorkspace;
  const openWorkspaceFiles = onOpenWorkspaceFiles ?? contextualActions.onOpenWorkspaceFiles;
  const [menu, setMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(
    null,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsAt, setConnectionsAt] = useState({ x: 0, y: 0 });
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);

  // Only READY connections are counted: a refused backend is known but cannot
  // serve, and counting it would overstate what the user can reach.
  const readyCount = connections
    ? connections.filter((c) => c.status === 'ready').length
    : (agentCount ?? 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Same honesty rule as `readyCount` above: the dot is 'idle' (never a
  // false-positive green) until a real probe says otherwise, and 'error'
  // (never a silent green) when the probe reports unreachable.
  const relayDotStatus: SessionStatus = !relayStatus?.configured
    ? 'idle'
    : relayStatus.reachable
      ? 'ok'
      : 'error';
  const relayTitle = !relayStatus
    ? 'Relays — opens settings'
    : !relayStatus.configured
      ? 'No relay configured — opens settings'
      : `Relay ${relayStatus.reachable ? 'reachable' : 'unreachable'}${relayStatus.detail ? ` · ${relayStatus.detail}` : ''} — opens settings`;

  function openMenu(event: React.MouseEvent, sessionId: string) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ sessionId, x: event.clientX, y: event.clientY });
  }

  const menuSession = menu
    ? groups.flatMap((group) => group.sessions).find((session) => session.id === menu.sessionId)
    : undefined;
  const items: MenuItemDef[] = SESSION_ACTIONS.filter(
    // Offering an action the surface cannot perform promises something that
    // does nothing when clicked.
    (action) => action.id !== 'rename' || onRenameSession !== undefined,
  ).flatMap((action) => {
    const item: MenuItemDef = {
      id: action.id,
      label: action.id === 'pin' && menuSession?.pinned ? 'unpin' : action.label,
      ariaLabel:
        action.id === 'pin' && menuSession?.pinned
          ? 'Unpin'
          : `${action.label.charAt(0).toUpperCase()}${action.label.slice(1)}`,
      icon: <Icon name={action.icon} size={11} />,
      // Unsupported actions are shown in the destructive tone — visible, not
      // silently absent — and cannot be invoked.
      ...((action.id === 'pin' || action.id === 'delete') && !sessionAction
        ? { disabled: true, title: 'This session action is unavailable here' }
        : {}),
      ...(action.id === 'delete' ? { tone: 'danger' as const } : {}),
    };
    // The prototype's hairline between the safe actions and the destructive
    // one (ctxOpen block): pin/rename, [separator], delete.
    return action.id === 'delete'
      ? [{ id: 'session-danger-separator', type: 'separator' as const, label: '' }, item]
      : [item];
  });

  const menuGroup = groupMenu ? groups.find((group) => group.id === groupMenu.groupId) : undefined;
  const workspaceItems: MenuItemDef[] = [
    {
      id: 'pin-workspace',
      // The prototype's wsCtxPinLabel: the LABEL itself flips (there is no
      // check-icon column on this flat menu — same grammar as the session
      // menu's pin/unpin, not the checked-icon permissions grammar).
      label: menuGroup?.pinned ? 'unpin workspace' : 'pin workspace',
      ariaLabel: menuGroup?.pinned ? 'Unpin workspace' : 'Pin workspace',
      icon: <Icon name="pin" size={11} />,
      disabled: !workspaceAction,
      ...(!workspaceAction ? { title: 'Workspace pinning is unavailable here' } : {}),
    },
    {
      id: 'open-in-files',
      label: 'open in files',
      icon: <Icon name="folder" size={11} />,
      disabled: !openWorkspaceFiles,
      ...(!openWorkspaceFiles ? { title: 'The files panel is not wired in this view' } : {}),
    },
    {
      id: 'rename-workspace',
      label: 'rename workspace',
      icon: <Icon name="pencil" size={11} />,
      disabled: !renameWorkspace,
      ...(!renameWorkspace ? { title: 'Workspace rename is unavailable here' } : {}),
    },
    {
      id: 'new-session-here',
      label: 'new session here',
      icon: <Icon name="plus" size={11} />,
      disabled: !newSession,
      ...(!newSession ? { title: 'Session creation is unavailable here' } : {}),
    },
    // The prototype's hairline between the safe actions and the destructive
    // one (wsCtxOpen block) — separates 'new session here' from 'remove
    // workspace' exactly like the session menu separates 'rename' from
    // 'delete'.
    { id: 'ws-danger-separator', type: 'separator', label: '' },
    {
      id: 'remove-workspace',
      label: 'remove workspace',
      icon: <Icon name="x" size={10} />,
      tone: 'danger',
      disabled: !workspaceAction,
      ...(!workspaceAction ? { title: 'Workspace removal is unavailable here' } : {}),
    },
  ];

  const orderedGroups = [
    ...groups.filter((group) => group.pinned),
    ...groups.filter((group) => !group.pinned),
  ];

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
            aria-label="Search sessions and workspaces"
            title="Search sessions and workspaces"
            disabled={!onOpenSearch}
            onClick={() => onOpenSearch?.()}
          >
            <Icon name="search" />
          </button>
          <button
            type="button"
            className="shell-rail__headingbutton shell-rail__headingbutton--accent"
            aria-label="New session"
            title="New session"
            disabled={!newSession}
            onClick={() => newSession?.()}
          >
            <Icon name="plus" size={11} />
          </button>
        </span>
      </div>

      <nav className="shell-rail__body" aria-label="Workspaces">
        <div className="shell-rail__list">
          {orderedGroups.map((group) => {
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
                  onClick={(event) => {
                    if ((event.target as Element).closest('.shell-rail__grouplabel-edit')) return;
                    setCollapsedGroups((cur) =>
                      cur.includes(group.id)
                        ? cur.filter((id) => id !== group.id)
                        : [...cur, group.id],
                    );
                  }}
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
                  {renamingGroupId === group.id && renameWorkspace ? (
                    <span className="shell-rail__grouplabel-edit">
                      <InlineEdit
                        value={group.label}
                        label="Workspace name"
                        size="rail"
                        startEditing
                        onCancel={() => setRenamingGroupId(null)}
                        onCommit={(next) => {
                          setRenamingGroupId(null);
                          renameWorkspace(group.id, next);
                        }}
                      />
                    </span>
                  ) : (
                    <span className="shell-rail__grouplabel">{group.label}</span>
                  )}
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
        {/*
         * Content divergence is DELIBERATE, same class of call as
         * Composer.tsx's approval-mode comment: the prototype's static demo
         * is a single-backend world, so its 'agents' cell is plain
         * navigation (`goSettingsAgents` — opens Settings > Agents). This app
         * manages MULTIPLE live clio deployments the user can swap between
         * (`connections`, owned by App's ConnectionPool), a real axis the
         * prototype never modelled — so the click opens the switcher rather
         * than only navigating. Settings > Agents still exists and lists the
         * same connections for the user who wants the nav path instead.
         */}
        <button
          type="button"
          className="shell-rail__footcell"
          data-testid="rail-connections"
          aria-haspopup="menu"
          aria-expanded={connectionsOpen}
          title="Connected agents — click to switch the connected backend"
          onClick={(event) => {
            if (!onSwitchConnection) return;
            const box = event.currentTarget.getBoundingClientRect();
            setConnectionsOpen((cur) => !cur);
            setConnectionsAt({ x: box.left, y: box.top });
          }}
        >
          {/* The prototype's dot is a plain static green (background:var(--t-ok),
              no clio-pulse) — never the busy/in-progress accent. 'running'
              would be the wrong state here even ignoring the prototype: it
              means "task in progress" everywhere else this vocabulary is
              used, not "backend reachable". 'idle' when nothing is ready
              keeps the honesty this app's dots are held to elsewhere (never
              paint green over zero live connections). */}
          <StatusDot status={readyCount > 0 ? 'ok' : 'idle'} quiet />
          <span>agents </span>
          <span className="shell-rail__footcount">{readyCount}</span>
        </button>
        {/* GET /v1/relay/status (clio-agent#1179) landed: this backend's own
            configured relay + a fresh reachability probe. Plain navigation
            to Settings > Relays, same as the prototype's `goSettingsRelays`
            — unlike the agents cell above, there is no second live axis
            here (one backend has exactly one configured relay) forcing a
            richer control. */}
        <button
          type="button"
          className="shell-rail__footcell"
          data-testid="rail-relay"
          title={relayTitle}
          onClick={() => onOpenSettings?.('relays')}
        >
          <StatusDot status={relayDotStatus} quiet />
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
        items={workspaceItems}
        onSelect={(id) => {
          if (!groupMenu) return;
          if (id === 'pin-workspace') {
            workspaceAction?.(groupMenu.groupId, 'pin');
            return;
          }
          if (id === 'open-in-files') {
            openWorkspaceFiles?.(groupMenu.groupId);
            return;
          }
          if (id === 'rename-workspace') {
            workspaceAction?.(groupMenu.groupId, 'rename');
            setRenamingGroupId(groupMenu.groupId);
            return;
          }
          if (id === 'new-session-here') {
            newSession?.(groupMenu.groupId);
            return;
          }
          if (id === 'remove-workspace') {
            workspaceAction?.(groupMenu.groupId, 'remove');
          }
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
