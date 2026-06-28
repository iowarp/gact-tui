/**
 * UI component: Sessions Column. Renders `SessionsColumn` from `SessionsColumnProps`.
 */
import { createMemo, createResource, createSignal } from 'solid-js';
import {
  filterSessionRows,
  isSessionListInitialLoading,
  sessionRowsForView,
  sessionToRow,
  workspaceDisplayName,
} from './SessionsColumnModel.js';
import { SessionsColumnBody } from './SessionsColumnBody.js';
import { SessionsColumnFooter } from './SessionsColumnFooter.js';
import { SessionsColumnHeader } from './SessionsColumnHeader.js';
import type { Client } from '@clio/core';
import type { SessionRow, WorkspaceOption } from './SessionsColumnModel.js';
import './sessions-column.css';

export type { SessionRow, WorkspaceOption } from './SessionsColumnModel.js';

export interface SessionsColumnProps {
  rows: SessionRow[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewSession?: () => void | Promise<void>;
  /** Optional connection / SSE status pip for the header. */
  connectionLabel?: string;
  connectionTone?: 'ok' | 'warn' | 'err' | 'idle';
  /** Available workspaces; renders a switcher when more than one. */
  workspaces?: WorkspaceOption[];
  /** Currently-selected workspace id ("__all" for unfiltered). */
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  /** True while the sessions list is loading — renders skeleton rows
   * instead of the empty state so first paint doesn't flash "No sessions". */
  loading?: boolean;
  /** Manual list refresh — usually wired to live.refetch(). */
  onRefresh?: () => void | Promise<void>;
  /** Import a session from a JSON blob (POST /v1/sessions/import). */
  onImportSession?: (blob: Record<string, unknown>) => void | Promise<void>;
  /** Per-row actions; rendered as a hover-revealed kebab menu. */
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string) => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
  onTogglePin?: (id: string) => void;
  onOpenSettings?: () => void;
  onCollapse?: () => void;
  /** When set, enables the "View archive" toggle — clicking it fetches
   * archived sessions via `client.sessions({archived: true})` and
   * renders them in place of the live list until the user toggles
   * back. Read-only browse — selecting an archived row still flows
   * through `onSelect`. */
  archivedClient?: Client;
}

export function SessionsColumn(props: SessionsColumnProps) {
  const [query, setQuery] = createSignal('');
  const [runningOnly, setRunningOnly] = createSignal(false);
  const [archiveView, setArchiveView] = createSignal(false);

  // Archive bucket — only fetched while the toggle is on. The resource
  // re-runs every time the toggle flips (false → null hit, true → fresh
  // pull). On select the row still flows through `onSelect`.
  const [archiveData] = createResource(
    () => (archiveView() && props.archivedClient ? props.archivedClient : null),
    async (c) => {
      if (!c) return [] as SessionRow[];
      try {
        const { sessions } = await c.sessions({ archived: true });
        return sessions.map(sessionToRow);
      } catch {
        return [] as SessionRow[];
      }
    },
  );

  const sourceRows = createMemo(() => sessionRowsForView(props.rows, archiveData(), archiveView()));

  const workspaceDisplay = (workspaceId: string | undefined): string | undefined =>
    workspaceDisplayName(props.workspaces, workspaceId);

  const filtered = createMemo(() =>
    filterSessionRows(sourceRows(), {
      query: query(),
      runningOnly: runningOnly(),
      workspaces: props.workspaces,
    }),
  );

  return (
    <aside class="sx" data-testid="sessions-column" aria-label="Sessions">
      <SessionsColumnHeader
        rows={props.rows}
        query={query}
        setQuery={setQuery}
        runningOnly={runningOnly}
        setRunningOnly={setRunningOnly}
        archiveView={archiveView}
        setArchiveView={setArchiveView}
        connectionLabel={props.connectionLabel}
        connectionTone={props.connectionTone}
        workspaces={props.workspaces}
        selectedWorkspaceId={props.selectedWorkspaceId}
        onPickWorkspace={props.onPickWorkspace}
        onNewSession={props.onNewSession}
        onRefresh={props.onRefresh}
        onImportSession={props.onImportSession}
        archiveEnabled={!!props.archivedClient}
      />

      <SessionsColumnBody
        rows={props.rows}
        filteredRows={filtered()}
        loading={isSessionListInitialLoading(props.loading, props.rows.length)}
        activeId={props.activeId}
        workspaceDisplay={workspaceDisplay}
        onSelect={props.onSelect}
        onRenameSession={props.onRenameSession}
        onDeleteSession={props.onDeleteSession}
        onExportSession={props.onExportSession}
        onShareSession={props.onShareSession}
        onForkSession={props.onForkSession}
        onTogglePin={props.onTogglePin}
      />
      <SessionsColumnFooter onOpenSettings={props.onOpenSettings} />
    </aside>
  );
}
