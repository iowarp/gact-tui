import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { sessionAgentRef } from './plugin-domain.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('ClioRepository session contract', () => {
  it('sends per-message mark deltas alongside other metadata and preserves returned marks', async () => {
    const transport = new RecordingTransport([
      {
        id: 's',
        workspace_id: 'ws',
        title: 'Review',
        state: 'completed',
        created_at: '',
        updated_at: '',
        metadata: { message_marks: { m: true } },
      },
    ]);
    const repository = new ClioRepository(transport);
    const session = await repository.updateSession('s', {
      pinned: true,
      message_marks: { m: true, old: false },
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/v1/sessions/s',
      body: { metadata: { pinned: true, message_marks: { m: true, old: false } } },
    });
    expect(session.metadata?.message_marks).toEqual({ m: true });
  });
  it('reads one child with a workspace guard and decodes its current route', async () => {
    const transport = new RecordingTransport([
      {
        id: 'child',
        workspace_id: 'ws',
        parent_session_id: 'parent',
        title: 'Reviewer',
        state: 'running',
        created_at: '',
        updated_at: '',
        provider_id: 'codex',
        model_id: 'luna',
        mode: 'plan',
        approval_mode: 'ask',
      },
    ]);
    const repository = new ClioRepository(transport);
    await expect(repository.session('child', 'ws')).resolves.toMatchObject({
      parent_session_id: 'parent',
      provider_id: 'codex',
      model_id: 'luna',
      mode: 'plan',
    });
    expect(transport.requests[0]?.path).toBe('/v1/sessions/child?workspace_id=ws');
  });
  it('keeps the pinned agent reference a session row carries in its metadata', async () => {
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
            metadata: {
              agent_ref: 'clio/earthscope-flat',
              agent_delta: { add: ['hdf5'], remove: [] },
            },
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const [session] = await repository.sessionFamily('sess_ndp');
    expect(sessionAgentRef(session)).toBe('clio/earthscope-flat');
    expect(sessionAgentRef({ metadata: {} })).toBe('');
  });
});
