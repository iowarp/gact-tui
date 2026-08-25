import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('ClioRepository session contract', () => {
  it('preserves the authoritative active blueprint identity on session rows', async () => {
    const transport = new RecordingTransport([
      {
        sessions: [
          {
            id: 'sess_ndp',
            workspace_id: 'ws_demo',
            title: 'NDP demo',
            state: 'completed',
            created_at: '2026-08-24T00:00:00Z',
            updated_at: '2026-08-24T00:00:00Z',
            active_blueprint_id: 'earthscope-flat',
            active_blueprint_name: 'EarthScope (Flat / Haiku)',
            active_blueprint_version: '0.1.0',
            active_blueprint_scope: 'global',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.sessions('ws_demo')).resolves.toMatchObject([
      {
        active_blueprint_id: 'earthscope-flat',
        active_blueprint_name: 'EarthScope (Flat / Haiku)',
        active_blueprint_version: '0.1.0',
        active_blueprint_scope: 'global',
      },
    ]);
  });
});
