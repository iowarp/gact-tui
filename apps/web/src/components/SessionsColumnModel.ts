/**
 * View-model / pure logic for Sessions Column: state shaping and helpers, no DOM. Key export `SessionRow`.
 */
import type { Session, SessionStatus } from '@clio/core';

export interface SessionRow {
  id: string;
  title: string;
  status: SessionStatus;
  /** Free-text preview of the most recent message body, ≤ 90 chars. */
  preview?: string;
  /** Workspace or project label — shown as a small chip in the row. */
  workspace?: string;
  /** Humanized "2m" / "1h" / "3d". */
  updatedAt: string;
  /** Optional model badge ("opus 4.7", "gpt-oss-120b"). */
  model?: string;
  /** Per-session rolling cost in USD. */
  costUsd?: number;
  /** When true the row sorts to the top of the list and shows a pin icon. */
  pinned?: boolean;
  /** Epoch ms — last time this row was touched by SSE. Drives the pulse. */
  bumpedAt?: number;
  /** When set, the row is a fork of `parentId` — displayed as a small
   * lineage hint next to the title. */
  parentId?: string;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  rootPath?: string;
}

export function humanWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const delta = Date.now() - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function isRunningStatus(status: SessionStatus): boolean {
  return status === 'running' || status === 'waiting_permission';
}

export function workspaceDisplayName(
  workspaces: readonly WorkspaceOption[] | undefined,
  workspaceId: string | undefined,
): string | undefined {
  if (!workspaceId) return undefined;
  return workspaces?.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
}

export function sessionRowsForView(
  liveRows: readonly SessionRow[],
  archiveRows: readonly SessionRow[] | undefined,
  archiveView: boolean,
): readonly SessionRow[] {
  return archiveView ? (archiveRows ?? []) : liveRows;
}

export function shouldShowRunningOnlyFilter(
  liveRows: readonly SessionRow[],
  archiveView: boolean,
): boolean {
  return !archiveView && liveRows.some((row) => isRunningStatus(row.status));
}

export function isSessionListInitialLoading(
  loading: boolean | undefined,
  liveRowCount: number,
): boolean {
  return loading === true && liveRowCount === 0;
}

export function filterSessionRows(
  rows: readonly SessionRow[],
  options: {
    query?: string;
    runningOnly?: boolean;
    workspaces?: readonly WorkspaceOption[];
  } = {},
): SessionRow[] {
  const q = options.query?.trim().toLowerCase() ?? '';
  let matches = !q
    ? [...rows]
    : rows.filter((row) => {
        const workspaceLabel = workspaceDisplayName(options.workspaces, row.workspace);
        return (
          row.title.toLowerCase().includes(q) ||
          (row.preview ?? '').toLowerCase().includes(q) ||
          (row.workspace ?? '').toLowerCase().includes(q) ||
          (workspaceLabel ?? '').toLowerCase().includes(q)
        );
      });

  if (options.runningOnly) {
    matches = matches.filter((row) => isRunningStatus(row.status));
  }

  const pinned: SessionRow[] = [];
  const rest: SessionRow[] = [];
  for (const row of matches) (row.pinned ? pinned : rest).push(row);
  return [...pinned, ...rest];
}

export function sessionToRow(session: Session): SessionRow {
  return {
    id: session.id,
    title: session.title || session.id,
    status: session.status,
    updatedAt: humanWhen(session.updated_at),
    ...(session.workspace_id ? { workspace: session.workspace_id } : {}),
  };
}

export async function readSessionImportBlob(
  file: Pick<File, 'text'>,
): Promise<Record<string, unknown>> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Import file must contain a JSON object.');
  }
  return parsed as Record<string, unknown>;
}
