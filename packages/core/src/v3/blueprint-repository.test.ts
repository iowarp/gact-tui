import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { BlueprintRepository } from './blueprint-repository.js';

describe('blueprint source update checks', () => {
  it('reads durable operations and supplies empty optional receipt collections', async () => {
    const transport = new RecordingTransport([
      { operations: [{ id: 'operation', label: 'Reload', status: 'interrupted' }] },
    ]);
    const repository = new BlueprintRepository(transport);
    const operations = await repository.blueprintOperations();
    expect(operations).toEqual([
      {
        id: 'operation',
        label: 'Reload',
        status: 'interrupted',
        target: {},
        installed: [],
        skipped: [],
      },
    ]);
  });
  it('reads the fleet-wide update check and reports the typed reason per source', async () => {
    const transport = new RecordingTransport([
      {
        sources: [
          {
            source_id: 'src_1',
            source: 'https://github.com/iowarp/clio-blueprints',
            ref: 'main',
            installed_commit: 'ea49ed17aa',
            remote_commit: 'ea49ed17aa',
            update_available: false,
            reason: 'up_to_date',
          },
          {
            source_id: 'src_2',
            source: 'https://github.com/iowarp/other-blueprints',
            ref: 'main',
            installed_commit: 'aaaa111',
            remote_commit: 'bbbb222',
            update_available: true,
            reason: 'update_available',
          },
          {
            source_id: 'src_3',
            source: '/local/blueprints',
            update_available: null,
            reason: 'path_source_not_git',
            detail: 'This source was added from a local path, not a git checkout.',
          },
        ],
        checked_at: '2026-09-18T00:00:00Z',
      },
    ]);
    const repository = new BlueprintRepository(transport);

    const result = await repository.blueprintSourceUpdates();

    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/agent-blueprints/sources/updates',
    });
    expect(result.checked_at).toBe('2026-09-18T00:00:00Z');
    expect(result.sources).toEqual([
      expect.objectContaining({
        source_id: 'src_1',
        update_available: false,
        reason: 'up_to_date',
      }),
      expect.objectContaining({
        source_id: 'src_2',
        update_available: true,
        reason: 'update_available',
      }),
      expect.objectContaining({
        source_id: 'src_3',
        update_available: null,
        reason: 'path_source_not_git',
        detail: 'This source was added from a local path, not a git checkout.',
      }),
    ]);
  });

  it('scopes the single-source check to its own route and unwraps the source envelope, never fabricating an answer it could not check', async () => {
    // The route wraps its one row under `source` (mirrors the list route's
    // `{ sources, checked_at }` shape) -- confirmed against the live server,
    // not assumed from the route's name.
    const transport = new RecordingTransport([
      {
        source: {
          source_id: 'src_4',
          source: 'https://github.com/iowarp/clio-blueprints',
          update_available: null,
          reason: 'timeout',
          detail: 'ls-remote did not respond within the configured budget.',
        },
        checked_at: '2026-09-18T00:00:00Z',
      },
    ]);
    const repository = new BlueprintRepository(transport);

    const result = await repository.blueprintSourceUpdate('src_4');

    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/agent-blueprints/sources/src_4/updates',
    });
    expect(result).toEqual({
      source_id: 'src_4',
      source: 'https://github.com/iowarp/clio-blueprints',
      update_available: null,
      reason: 'timeout',
      detail: 'ls-remote did not respond within the configured budget.',
    });
  });

  it('decodes an unrecognized reason as unknown instead of failing the request', async () => {
    const transport = new RecordingTransport([
      {
        sources: [
          {
            source_id: 'src_5',
            source: 'https://github.com/iowarp/clio-blueprints',
            update_available: null,
            reason: 'a_future_reason_this_client_has_not_learned_yet',
          },
        ],
      },
    ]);
    const repository = new BlueprintRepository(transport);

    const result = await repository.blueprintSourceUpdates();

    expect(result.sources[0]).toMatchObject({ reason: 'unknown', update_available: null });
  });
});

describe('marketplace ownership and outcomes', () => {
  it('keeps qualified identities distinct while retaining the author id', async () => {
    const transport = new RecordingTransport([
      {
        agent_blueprints: [
          { id: 'demo', identity: 'global::src_a::demo', source_id: 'src_a', title: 'Demo' },
          { id: 'demo', identity: 'global::src_b::demo', source_id: 'src_b', title: 'Demo' },
        ],
      },
    ]);
    const rows = await new BlueprintRepository(transport).agentBlueprints();
    expect(rows.map((row) => row.id)).toEqual(['global::src_a::demo', 'global::src_b::demo']);
    expect(rows.map((row) => row.blueprint_id)).toEqual(['demo', 'demo']);
  });

  it('rejects an HTTP-success envelope whose installation actually failed', async () => {
    const transport = new RecordingTransport([
      {
        source: {
          id: 'src_a',
          name: 'Demo',
          source: '/demo',
          status: 'error',
          error: 'Unable to stage revision',
        },
      },
    ]);
    await expect(
      new BlueprintRepository(transport).refreshAgentBlueprintSource('src_a'),
    ).rejects.toThrow('Unable to stage revision');
  });

  it('retains partial results and durable user choices', async () => {
    const source = {
      id: 'src_a',
      name: 'Demo',
      source: '/demo',
      status: 'degraded',
      error: 'Invalid blueprint',
      skipped_blueprints: [{ id: 'edited', reason: 'local_edits_present' }],
      installed_blueprints: [{ id: 'demo', identity: 'global::src_a::demo' }],
    };
    const transport = new RecordingTransport([{ source }]);
    const result = await new BlueprintRepository(transport).refreshAgentBlueprintSource('src_a');
    expect(result.skipped_blueprints).toEqual(source.skipped_blueprints);
    expect(result.installed_blueprints).toEqual(source.installed_blueprints);
  });
});

it('saves source configuration without converting an existing source error into a failed save', async () => {
  const transport = new RecordingTransport([
    {
      source: {
        id: 'src_1',
        name: 'Lab',
        source: '/lab',
        status: 'error',
        error: 'Previous reload failed',
        pinned_commit: 'a'.repeat(40),
        working_checkout: '/checkout',
        is_default: true,
        reload_required: true,
        updated_at: 'new-revision',
      },
    },
  ]);
  const repository = new BlueprintRepository(transport);
  const row = await repository.configureAgentBlueprintSource('src_1', {
    name: 'Lab',
    source: '/lab',
    expected_updated_at: 'old-revision',
  });
  expect(transport.requests[0]).toMatchObject({
    method: 'PATCH',
    path: '/v1/agent-blueprints/sources/src_1',
    body: { name: 'Lab', source: '/lab', expected_updated_at: 'old-revision' },
  });
  expect(row).toMatchObject({
    status: 'error',
    reload_required: true,
    working_checkout: '/checkout',
    is_default: true,
  });
});
