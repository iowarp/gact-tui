import { useState, type ReactNode } from 'react';
import { Splitter, Tabs, type TabDef } from '../kit';
import { Rail, type RailConnection, type RailGroup } from './Rail';
import { Topbar } from './Topbar';
import './appshell.css';

export interface AppShellProps {
  groups: RailGroup[];
  activeSessionId: string | null;
  title: string;
  breadcrumb?: string;
  breadcrumbTitle?: string;
  /** The hierarchy ribbon — main plus any focused child agents. */
  ribbon: TabDef[];
  activeRibbonId: string;
  artifactCount?: number;
  contextPercent?: number;
  children: ReactNode;
  /** Optional right pane; absent when nothing is selected. */
  detail?: ReactNode;
  /** Optional bottom dock inside the centre column (the desktop console). */
  dock?: ReactNode;
  onSelectSession: (id: string) => void;
  onSelectRibbon: (id: string) => void;
  /** Rename a session in place — from the rail row menu or the topbar title. */
  onRenameSession?: (sessionId: string, title: string) => void;
  /** Which side panel is open; drives the toolbar's pressed state. */
  panel?: string | null;
  onTogglePanel?: (panel: string) => void;
  /** Live agent count shown in the rail footer band. */
  agentCount?: number;
  /** Connected clio deployments, for the footer's swap menu (S6). */
  connections?: RailConnection[];
  activeConnectionId?: string;
  onSwitchConnection?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
}

/** The prototype's rail defaults: 300px, clamped 200–460. */
const RAIL_DEFAULT = 300;
const RAIL_MIN = 200;
const RAIL_MAX = 460;
/** The prototype's right pane width. */
const DETAIL_DEFAULT = 480;

/**
 * The application shell — rail, topbar, hierarchy ribbon, content region.
 *
 * Pure composition over the kit: it introduces no dialog, menu or overlay of
 * its own, which is what the conformance guard checks.
 */
export function AppShell({
  groups,
  activeSessionId,
  title,
  breadcrumb,
  breadcrumbTitle,
  ribbon,
  activeRibbonId,
  artifactCount,
  contextPercent,
  children,
  detail,
  dock,
  onSelectSession,
  onSelectRibbon,
  onRenameSession,
  panel,
  onTogglePanel,
  agentCount,
  connections,
  activeConnectionId,
  onSwitchConnection,
  onOpenSettings,
  onOpenSearch,
}: AppShellProps) {
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT);
  const [railCollapsed, setRailCollapsed] = useState(false);

  return (
    <div className="shell">
      {railCollapsed ? null : (
        <>
          <div className="shell__rail" style={{ width: `${railWidth}px` }}>
            <Rail
              groups={groups}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onCollapse={() => setRailCollapsed(true)}
              {...(onRenameSession ? { onRenameSession } : {})}
              {...(agentCount !== undefined ? { agentCount } : {})}
              {...(connections ? { connections } : {})}
              {...(activeConnectionId ? { activeConnectionId } : {})}
              {...(onSwitchConnection ? { onSwitchConnection } : {})}
              {...(onOpenSettings ? { onOpenSettings } : {})}
              {...(onOpenSearch ? { onOpenSearch } : {})}
            />
          </div>
          <Splitter
            label="Rail width"
            value={railWidth}
            min={RAIL_MIN}
            max={RAIL_MAX}
            onResize={setRailWidth}
          />
        </>
      )}

      <div className="shell__column">
        <Topbar
          title={title}
          {...(breadcrumb === undefined ? {} : { breadcrumb })}
          {...(breadcrumbTitle === undefined ? {} : { breadcrumbTitle })}
          {...(artifactCount === undefined ? {} : { artifactCount })}
          {...(contextPercent === undefined ? {} : { contextPercent })}
          railCollapsed={railCollapsed}
          onShowRail={() => setRailCollapsed(false)}
          {...(panel !== undefined ? { panel } : {})}
          {...(onTogglePanel ? { onTogglePanel } : {})}
          {...(onRenameSession && activeSessionId
            ? { onRename: (next: string) => onRenameSession(activeSessionId, next) }
            : {})}
        />

        <div className="shell__ribbon">
          <Tabs
            label="Agent hierarchy"
            tabs={ribbon}
            activeId={activeRibbonId}
            onChange={onSelectRibbon}
            variant="quiet"
          />
        </div>

        <main className="shell__content">{children}</main>
        {dock ? <div className="shell__dock">{dock}</div> : null}
      </div>

      {detail ? (
        <div className="shell__detail" style={{ width: `${DETAIL_DEFAULT}px` }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export type { RailGroup };
