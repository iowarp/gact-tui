import { describe, expect, it } from 'vitest';
import type { SessionRow } from '../../src/components/SessionsColumn.js';
import {
  activeWorkspaceIdForRows,
  filterRowsForWorkspace,
  semanticOptionsFromResult,
  semanticsCatalogScope,
  workspaceOptionsFromRows,
} from '../../src/routes/chatWorkspaceSemanticsModel.js';

const rows: SessionRow[] = [
  {
    id: 's1',
    title: 'Geo',
    status: 'idle',
    updatedAt: '',
    workspace: 'ws_geo',
  },
  {
    id: 's2',
    title: 'Detached',
    status: 'idle',
    updatedAt: '',
  },
  {
    id: 's3',
    title: 'Ops',
    status: 'idle',
    updatedAt: '',
    workspace: 'ws_ops',
  },
];

describe('chatWorkspaceSemanticsModel', () => {
  it('maps workspace API rows into session-column options', () => {
    expect(
      workspaceOptionsFromRows([
        { id: 'ws_geo', name: 'Geospatial', root_path: '/data/geo' },
      ]),
    ).toEqual([{ id: 'ws_geo', name: 'Geospatial', rootPath: '/data/geo' }]);
  });

  it('keeps detached sessions visible when filtering by workspace', () => {
    expect(filterRowsForWorkspace(rows, '__all').map((row) => row.id)).toEqual([
      's1',
      's2',
      's3',
    ]);
    expect(filterRowsForWorkspace(rows, 'ws_geo').map((row) => row.id)).toEqual([
      's1',
      's2',
    ]);
  });

  it('resolves active workspace from active session before selected fallback', () => {
    expect(activeWorkspaceIdForRows(rows, 's3', 'ws_geo')).toBe('ws_ops');
    expect(activeWorkspaceIdForRows(rows, 'missing', 'ws_geo')).toBe('ws_geo');
    expect(activeWorkspaceIdForRows(rows, 'missing', '__all')).toBeUndefined();
  });

  it('builds workspace-scoped catalog params only for concrete workspaces', () => {
    expect(semanticsCatalogScope('__all')).toEqual({});
    expect(semanticsCatalogScope(undefined)).toEqual({});
    expect(semanticsCatalogScope('ws_geo')).toEqual({ workspace_id: 'ws_geo' });
  });

  it('maps fulfilled semantic catalog rows and drops rejected sources', () => {
    expect(
      semanticOptionsFromResult(
        {
          status: 'fulfilled',
          value: {
            blueprints: [{ id: 'bp1', name: 'Blueprint', description: 'Use tools' }],
          },
        },
        'blueprints',
      ),
    ).toEqual([{ id: 'bp1', label: 'Blueprint', description: 'Use tools' }]);
    expect(
      semanticOptionsFromResult(
        { status: 'fulfilled', value: { packs: [{ id: 'pack1' }] } },
        'packs',
      ),
    ).toEqual([{ id: 'pack1', label: 'pack1' }]);
    expect(
      semanticOptionsFromResult(
        { status: 'rejected', reason: new Error('down') },
        'packs',
      ),
    ).toEqual([]);
  });
});
