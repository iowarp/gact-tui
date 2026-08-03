import { describe, expect, it } from 'vitest';
import type { Client } from '@clio/core';
import {
  catalogCategoryCounts,
  catalogHitsFromSettledResults,
  filterCatalogHits,
  groupCatalogHits,
  groupCatalogHitsWithIndexes,
  KIND_LABEL,
  loadCatalogHits,
  type CatalogHit,
} from '../../src/components/CatalogBrowserModel.js';

const HITS: CatalogHit[] = [
  { kind: 'workspace', id: 'ws_geo', label: 'Geospatial', detail: '/tmp/geo' },
  { kind: 'agent', id: 'main', label: 'Main agent', detail: 'Routes work' },
  { kind: 'tool', id: 'shell_bash', label: 'Shell command', detail: 'Run commands' },
  { kind: 'agent', id: 'data', label: 'Data expert', detail: 'NDP catalog work' },
  { kind: 'prompt', id: 'plot', label: 'Plot template' },
];

describe('CatalogBrowserModel', () => {
  it('builds catalog hits from every fulfilled backend source', () => {
    const hits = catalogHitsFromSettledResults({
      agentsResult: {
        status: 'fulfilled',
        value: { agents: [{ id: 'main', title: 'Main', description: 'Routes work' }] },
      },
      commandsResult: {
        status: 'fulfilled',
        value: { commands: [{ id: 'shell_bash', title: 'Shell command' }] },
      },
      mcpResult: {
        status: 'fulfilled',
        value: {
          servers: [
            {
              id: 'filesystem',
              name: 'Filesystem',
              transport: 'stdio',
              tools_count: 3,
              status: 'ready',
            },
          ],
        },
      },
      promptsResult: {
        status: 'fulfilled',
        value: { prompts: [{ id: 'plot', title: 'Plot template' }] },
      },
      workspacesResult: {
        status: 'fulfilled',
        value: { workspaces: [{ id: 'ws_geo', name: 'Geo', root_path: '/tmp/geo' }] },
      },
    });

    expect(hits).toEqual([
      { kind: 'agent', id: 'main', label: 'Main', detail: 'Routes work' },
      { kind: 'tool', id: 'shell_bash', label: 'Shell command' },
      {
        kind: 'mcp',
        id: 'filesystem',
        label: 'Filesystem',
        detail: 'stdio · 3 tools · ready',
      },
      { kind: 'prompt', id: 'plot', label: 'Plot template' },
      { kind: 'workspace', id: 'ws_geo', label: 'Geo', detail: '/tmp/geo' },
    ]);
  });

  it('keeps partial catalog results when one backend source fails', () => {
    const hits = catalogHitsFromSettledResults({
      agentsResult: { status: 'rejected', reason: new Error('agents unavailable') },
      commandsResult: {
        status: 'fulfilled',
        value: { commands: [{ id: 'shell_bash', description: 'Run commands' }] },
      },
      mcpResult: { status: 'rejected', reason: new Error('mcp unavailable') },
      promptsResult: { status: 'fulfilled', value: { prompts: [] } },
      workspacesResult: { status: 'fulfilled', value: { workspaces: [] } },
    });

    expect(hits).toEqual([
      { kind: 'tool', id: 'shell_bash', label: 'shell_bash', detail: 'Run commands' },
    ]);
  });

  it('filters hits by id, label, or detail case-insensitively', () => {
    expect(filterCatalogHits(HITS, '').map((hit) => hit.id)).toEqual([
      'ws_geo',
      'main',
      'shell_bash',
      'data',
      'plot',
    ]);
    expect(filterCatalogHits(HITS, 'NDP').map((hit) => hit.id)).toEqual(['data']);
    expect(filterCatalogHits(HITS, 'shell').map((hit) => hit.id)).toEqual(['shell_bash']);
    expect(filterCatalogHits(HITS, 'geo').map((hit) => hit.id)).toEqual(['ws_geo']);
  });

  it('groups filtered hits by kind in first-seen order', () => {
    expect(groupCatalogHits(HITS).map(([kind, hits]) => [kind, hits.map((hit) => hit.id)])).toEqual(
      [
        ['workspace', ['ws_geo']],
        ['agent', ['main', 'data']],
        ['tool', ['shell_bash']],
        ['prompt', ['plot']],
      ],
    );
  });

  it('groups filtered hits with stable flat indexes for keyboard navigation', () => {
    expect(
      groupCatalogHitsWithIndexes(HITS).map((group) => [
        group.kind,
        group.hits.map(({ hit, index }) => [hit.id, index]),
      ]),
    ).toEqual([
      ['workspace', [['ws_geo', 0]]],
      [
        'agent',
        [
          ['main', 1],
          ['data', 3],
        ],
      ],
      ['tool', [['shell_bash', 2]]],
      ['prompt', [['plot', 4]]],
    ]);
  });

  it('counts every catalog kind in the canonical summary order', () => {
    expect(catalogCategoryCounts(HITS)).toEqual([
      { kind: 'agent', count: 2 },
      { kind: 'tool', count: 1 },
      { kind: 'mcp', count: 0 },
      { kind: 'prompt', count: 1 },
      { kind: 'workspace', count: 1 },
    ]);
    expect(KIND_LABEL.mcp).toBe('MCP servers');
  });

  it('loads catalog hits from every client source in parallel', async () => {
    const client = {
      agents: async () => ({ agents: [{ id: 'geo', title: 'Geo expert' }] }),
      commands: async () => ({ commands: [{ id: 'shell_bash', title: 'Shell' }] }),
      mcpServers: async () => ({
        servers: [
          {
            id: 'filesystem',
            name: 'Filesystem',
            transport: 'stdio',
            tools_count: 4,
            status: 'ready',
          },
        ],
      }),
      prompts: async () => ({ prompts: [{ id: 'plot', title: 'Plot' }] }),
      workspaces: async () => ({
        workspaces: [{ id: 'ws1', name: 'Workspace', root_path: '/tmp/ws' }],
      }),
    } as unknown as Client;

    expect((await loadCatalogHits(client)).map((hit) => hit.id)).toEqual([
      'geo',
      'shell_bash',
      'filesystem',
      'plot',
      'ws1',
    ]);
  });
});
