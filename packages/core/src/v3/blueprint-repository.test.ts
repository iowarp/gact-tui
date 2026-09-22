import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { BlueprintRepository } from './blueprint-repository.js';

describe('blueprint source update checks', () => {
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
      expect.objectContaining({ source_id: 'src_1', update_available: false, reason: 'up_to_date' }),
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
