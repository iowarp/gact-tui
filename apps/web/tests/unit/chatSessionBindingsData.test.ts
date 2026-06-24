import { describe, expect, it, vi } from 'vitest';
import { loadSessionBindings, packagedProvenance } from '../../src/routes/chatSessionBindingsData.js';

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getSessionBlueprint: vi.fn().mockResolvedValue({ blueprint_id: null }),
    getSessionExpertPack: vi.fn().mockResolvedValue({ pack_id: null }),
    agentBlueprints: vi.fn().mockResolvedValue({ blueprints: [] }),
    expertPacks: vi.fn().mockResolvedValue({ packs: [] }),
    ...overrides,
  };
}

describe('chatSessionBindingsData', () => {
  it('maps current binding fields, lists, and provenance into inspector bindings', async () => {
    const client = makeClient({
      getSessionBlueprint: vi.fn().mockResolvedValue({
        active_agent_blueprint_id: 'bp_data',
        active_agent_blueprint_path: '/blueprints/data.yaml',
        workspace_id: 'ws_alpha',
        agent_overlay: { temperature: 0.2 },
        activation: { active_agent_blueprint_scope: 'workspace' },
        agent_blueprint: {
          id: 'bp_data',
          title: 'Data blueprint',
          version: '1.0.0',
          scope: 'workspace',
          enabled: true,
          validation_errors: ['warn'],
          metadata: {
            install: { source: 'marketplace' },
            bootstrap: { status: 'ok' },
          },
        },
      }),
      getSessionExpertPack: vi.fn().mockResolvedValue({ active_expert_pack_id: 'pack_geo' }),
      agentBlueprints: vi.fn().mockResolvedValue({
        blueprints: [
          { id: 'bp_data', name: 'Data', description: 'Data semantics' },
          { id: 'bp_geo' },
        ],
      }),
      expertPacks: vi.fn().mockResolvedValue({
        packs: [{ id: 'pack_geo', name: 'Geo', description: 'Geospatial tools' }],
      }),
    });

    await expect(loadSessionBindings(client, 'sess_1')).resolves.toEqual({
      blueprint_id: 'bp_data',
      pack_id: 'pack_geo',
      availableBlueprints: [
        { id: 'bp_data', label: 'Data', description: 'Data semantics' },
        { id: 'bp_geo', label: 'bp_geo' },
      ],
      availablePacks: [{ id: 'pack_geo', label: 'Geo', description: 'Geospatial tools' }],
      workspace_id: 'ws_alpha',
      blueprint_path: '/blueprints/data.yaml',
      overlay: { temperature: 0.2 },
      activation: { active_agent_blueprint_scope: 'workspace' },
      packaged: {
        id: 'bp_data',
        title: 'Data blueprint',
        version: '1.0.0',
        scope: 'workspace',
        enabled: true,
        validation_errors: ['warn'],
        install: { source: 'marketplace' },
        bootstrap: { status: 'ok' },
      },
    });
  });

  it('keeps partial data when one binding request fails', async () => {
    const client = makeClient({
      getSessionBlueprint: vi.fn().mockRejectedValue(new Error('offline')),
      getSessionExpertPack: vi.fn().mockResolvedValue({ pack_id: 'pack_a' }),
      agentBlueprints: vi.fn().mockResolvedValue({ blueprints: [{ id: 'bp_a', name: 'Alpha' }] }),
    });

    await expect(loadSessionBindings(client, 'sess_1')).resolves.toMatchObject({
      blueprint_id: null,
      pack_id: 'pack_a',
      availableBlueprints: [{ id: 'bp_a', label: 'Alpha' }],
      availablePacks: [],
    });
  });

  it('returns null when a client throws before creating promises', async () => {
    const client = makeClient({
      getSessionBlueprint: vi.fn(() => {
        throw new Error('bad client');
      }),
    });

    await expect(loadSessionBindings(client, 'sess_1')).resolves.toBeNull();
  });

  it('omits empty packaged provenance fields', () => {
    expect(
      packagedProvenance({
        agent_blueprint: {
          id: 'bp_data',
          version: '',
          scope: '',
          metadata: { install: {}, bootstrap: {} },
          validation_errors: [],
        },
      }),
    ).toEqual({ packaged: { id: 'bp_data' } });
  });
});
