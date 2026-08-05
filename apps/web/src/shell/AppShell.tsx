import { useState, type CSSProperties, type ReactNode } from 'react';
import type { RelayStatus } from '@clio/core';
import { Splitter, Tabs, type TabDef } from '../kit';
import {
  clampDetailWidth,
  DETAIL_WIDTH_DEFAULT,
  DETAIL_WIDTH_MAX,
  DETAIL_WIDTH_MIN,
} from './detailWidth';
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
  /** Observability tab the layer is showing — see Topbar's `obsTab`. */
  obsTab?: string;
  onTogglePanel?: (panel: string) => void;
  /** Live agent count shown in the rail footer band. */
  agentCount?: number;
  /** Connected clio deployments, for the footer's swap menu (S6). */
  connections?: RailConnection[];
  activeConnectionId?: string;
  onSwitchConnection?: (id: string) => void;
  /** See Rail's own doc: an optional `section` deep-links Settings straight
   *  to a SETTINGS_PAGES id (the rail footer's "relay" cell uses this to
   *  land on Settings > Relays rather than whatever page opened last). */
  onOpenSettings?: (section?: string) => void;
  onOpenSearch?: () => void;
  /** This backend's own relay reachability (GET /v1/relay/status), for the
   *  rail footer's "relay" cell. */
  relayStatus?: RelayStatus;
}

/** The prototype's rail defaults: 300px, clamped 200–460. */
const RAIL_DEFAULT = 300;
const RAIL_MIN = 200;
const RAIL_MAX = 460;

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
  obsTab,
  onTogglePanel,
  agentCount,
  connections,
  activeConnectionId,
  onSwitchConnection,
  onOpenSettings,
  onOpenSearch,
  relayStatus,
}: AppShellProps) {
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT);
  const [railCollapsed, setRailCollapsed] = useState(false);
  // The right pane's width persists for the session (the prototype's
  // drag-resizable 320-720 band, default 480; double-click resets).
  const [detailWidth, setDetailWidth] = useState(DETAIL_WIDTH_DEFAULT);

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
              {...(relayStatus ? { relayStatus } : {})}
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
          {...(obsTab !== undefined ? { obsTab } : {})}
          {...(onTogglePanel ? { onTogglePanel } : {})}
          {...(onRenameSession && activeSessionId
            ? { onRename: (next: string) => onRenameSession(activeSessionId, next) }
            : {})}
        />

        {/* The content row UNDER the full-width topbar: the centre column
            (ribbon, transcript, dock) beside the optional right detail pane.
            The pane lives here — inside the row, below the topbar — so it
            never competes with the topbar's own controls for the top band. */}
        <div className="shell__row">
          <div className="shell__main">
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
            <>
              <Splitter
                label="Detail width"
                value={detailWidth}
                min={DETAIL_WIDTH_MIN}
                max={DETAIL_WIDTH_MAX}
                invert
                onResize={(next) => setDetailWidth(clampDetailWidth(next))}
                onReset={() => setDetailWidth(DETAIL_WIDTH_DEFAULT)}
              />
              {/* Width rides a custom property, not a hard inline width, so
                  the stylesheet can defer to the panel's own collapsed strip
                  (.detail--strip) — a fixed width outliving the full panel
                  left the freed space as a black void. */}
              <div
                className="shell__detail"
                style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}
              >
                {detail}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type { RailGroup };
