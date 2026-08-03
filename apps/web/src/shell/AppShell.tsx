import { useState, type ReactNode } from 'react';
import { Splitter, Tabs, type TabDef } from '../kit';
import { Rail, type RailGroup } from './Rail';
import { Topbar } from './Topbar';
import './appshell.css';

export interface AppShellProps {
  groups: RailGroup[];
  activeSessionId: string | null;
  title: string;
  breadcrumb?: string;
  /** The hierarchy ribbon — main plus any focused child agents. */
  ribbon: TabDef[];
  activeRibbonId: string;
  artifactCount?: number;
  contextPercent?: number;
  children: ReactNode;
  /** Optional right pane; absent when nothing is selected. */
  detail?: ReactNode;
  onSelectSession: (id: string) => void;
  onSelectRibbon: (id: string) => void;
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
  ribbon,
  activeRibbonId,
  artifactCount,
  contextPercent,
  children,
  detail,
  onSelectSession,
  onSelectRibbon,
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
          {...(artifactCount === undefined ? {} : { artifactCount })}
          {...(contextPercent === undefined ? {} : { contextPercent })}
          railCollapsed={railCollapsed}
          onShowRail={() => setRailCollapsed(false)}
        />

        <div className="shell__ribbon">
          <Tabs
            label="Agent hierarchy"
            tabs={ribbon}
            activeId={activeRibbonId}
            onChange={onSelectRibbon}
          />
        </div>

        <main className="shell__content">{children}</main>
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
