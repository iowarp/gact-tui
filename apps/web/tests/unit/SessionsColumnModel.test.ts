import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterSessionRows,
  humanWhen,
  isSessionListInitialLoading,
  isRunningStatus,
  readSessionImportBlob,
  sessionRowsForView,
  sessionToRow,
  shouldShowRunningOnlyFilter,
  workspaceDisplayName,
} from '../../src/components/SessionsColumnModel.js';
import type { SessionRow, WorkspaceOption } from '../../src/components/SessionsColumnModel.js';

const ROWS: SessionRow[] = [
  {
    id: 'alpha',
    title: 'EarthScope analysis',
    status: 'idle',
    preview: 'metadata catalog staged',
    workspace: 'ws_geo',
    updatedAt: '1m',
  },
  {
    id: 'bravo',
    title: 'Permission review',
    status: 'waiting_permission',
    preview: 'needs operator approval',
    workspace: 'ws_ops',
    updatedAt: '2m',
    pinned: true,
  },
  {
    id: 'charlie',
    title: 'Live run',
    status: 'running',
    preview: 'streaming transcript',
    workspace: 'ws_live',
    updatedAt: '3m',
  },
  {
    id: 'delta',
    title: 'Failed import',
    status: 'error',
    preview: 'bad JSON',
    workspace: 'ws_ops',
    updatedAt: '4m',
    pinned: true,
  },
];

const WORKSPACES: WorkspaceOption[] = [
  { id: 'ws_geo', name: 'Geospatial Work' },
  { id: 'ws_ops', name: 'Operations' },
  { id: 'ws_live', name: 'Live Workspace' },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionsColumnModel', () => {
  it('formats relative update times and rejects invalid dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));

    expect(humanWhen()).toBe('');
    expect(humanWhen('not a date')).toBe('');
    expect(humanWhen('2026-06-20T11:59:45.000Z')).toBe('just now');
    expect(humanWhen('2026-06-20T11:42:00.000Z')).toBe('18m');
    expect(humanWhen('2026-06-20T09:45:00.000Z')).toBe('2h');
    expect(humanWhen('2026-06-17T11:00:00.000Z')).toBe('3d');
  });

  it('recognizes only actively running statuses', () => {
    expect(isRunningStatus('running')).toBe(true);
    expect(isRunningStatus('waiting_permission')).toBe(true);
    expect(isRunningStatus('finished')).toBe(false);
    expect(isRunningStatus('error')).toBe(false);
    expect(isRunningStatus('idle')).toBe(false);
  });

  it('uses workspace names for display and keeps the id fallback', () => {
    expect(workspaceDisplayName(WORKSPACES, 'ws_geo')).toBe('Geospatial Work');
    expect(workspaceDisplayName(WORKSPACES, 'ws_missing')).toBe('ws_missing');
    expect(workspaceDisplayName(WORKSPACES, undefined)).toBeUndefined();
  });

  it('filters by title, preview, workspace id, and workspace display name', () => {
    expect(
      filterSessionRows(ROWS, { query: 'earthscope', workspaces: WORKSPACES }).map((r) => r.id),
    ).toEqual(['alpha']);
    expect(
      filterSessionRows(ROWS, { query: 'operator', workspaces: WORKSPACES }).map((r) => r.id),
    ).toEqual(['bravo']);
    expect(
      filterSessionRows(ROWS, { query: 'ws_live', workspaces: WORKSPACES }).map((r) => r.id),
    ).toEqual(['charlie']);
    expect(
      filterSessionRows(ROWS, { query: 'operations', workspaces: WORKSPACES }).map((r) => r.id),
    ).toEqual(['bravo', 'delta']);
  });

  it('keeps pinned rows first without disturbing source order inside each group', () => {
    expect(filterSessionRows(ROWS).map((row) => row.id)).toEqual([
      'bravo',
      'delta',
      'alpha',
      'charlie',
    ]);
  });

  it('combines running-only filtering with pinned partitioning', () => {
    expect(filterSessionRows(ROWS, { runningOnly: true }).map((row) => row.id)).toEqual([
      'bravo',
      'charlie',
    ]);
  });

  it('derives session list view state from live/archive toggles', () => {
    const archiveRows = [ROWS[0]!, ROWS[3]!];
    expect(sessionRowsForView(ROWS, archiveRows, false)).toBe(ROWS);
    expect(sessionRowsForView(ROWS, archiveRows, true)).toBe(archiveRows);
    expect(sessionRowsForView(ROWS, undefined, true)).toEqual([]);

    expect(shouldShowRunningOnlyFilter(ROWS, false)).toBe(true);
    expect(shouldShowRunningOnlyFilter(ROWS, true)).toBe(false);
    expect(shouldShowRunningOnlyFilter([ROWS[0]!], false)).toBe(false);

    expect(isSessionListInitialLoading(true, 0)).toBe(true);
    expect(isSessionListInitialLoading(true, 1)).toBe(false);
    expect(isSessionListInitialLoading(false, 0)).toBe(false);
  });

  it('maps archived sessions into sidebar rows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));

    expect(
      sessionToRow({
        id: 'sid_123',
        title: '',
        status: 'finished',
        workspace_id: 'ws_archived',
        created_at: '2026-06-20T10:00:00.000Z',
        updated_at: '2026-06-20T11:30:00.000Z',
      }),
    ).toEqual({
      id: 'sid_123',
      title: 'sid_123',
      status: 'finished',
      workspace: 'ws_archived',
      updatedAt: '30m',
    });
  });

  it('reads session import JSON objects and rejects non-object payloads', async () => {
    await expect(
      readSessionImportBlob({
        text: async () => '{"session":{"id":"sid_123"},"messages":[]}',
      }),
    ).resolves.toEqual({ session: { id: 'sid_123' }, messages: [] });

    await expect(
      readSessionImportBlob({
        text: async () => '[]',
      }),
    ).rejects.toThrow('JSON object');
  });
});
