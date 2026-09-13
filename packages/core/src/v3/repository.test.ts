import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('ClioRepository interaction contracts', () => {
  it('preserves the server or MCP supplied title for tool activity', async () => {
    const transport = new RecordingTransport([
      {
        cursor: '42',
        messages: [],
        tools: [
          {
            id: 'call_1',
            session_id: 'sess_1',
            name: 'create_artifact',
            title: 'Create Artifact',
            state: 'succeeded',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.transcript('sess_1')).resolves.toMatchObject({
      cursor: '42',
      tools: [{ name: 'create_artifact', title: 'Create Artifact' }],
    });
  });

  it('contains an unreadable block inside its message instead of failing the transcript', async () => {
    const transport = new RecordingTransport([
      {
        cursor: '43',
        messages: [
          {
            id: 'msg_1',
            session_id: 'sess_1',
            role: 'assistant',
            created_at: '2026-08-22T12:00:00Z',
            blocks: [
              { id: 'block_1', type: 'text', text: 'Grounded answer', citation_ids: ['cite_1'] },
              { id: 'block_2', type: 'text' },
              { id: 'block_3', type: 'holograph', frames: 4 },
            ],
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const transcript = await repository.transcript('sess_1');

    expect(transcript.messages[0]?.blocks).toEqual([
      { id: 'block_1', type: 'text', text: 'Grounded answer' },
      {
        id: 'block_2',
        type: 'unknown',
        original_type: 'text',
        raw: { id: 'block_2', type: 'text' },
      },
      {
        id: 'block_3',
        type: 'unknown',
        original_type: 'holograph',
        raw: { id: 'block_3', type: 'holograph', frames: 4 },
      },
    ]);
  });

  it('sends the selected model through the canonical GACT message envelope', async () => {
    const transport = new RecordingTransport([
      {
        message_id: 'message_1',
        accepted_at: '2026-08-31T12:00:00Z',
        delivery: 'start',
        state: 'started',
        effective_model: { provider_id: 'claude_code', model_id: 'sonnet' },
        behavior: {
          reasoning_effort: 'high',
          execution_mode: 'execute',
          confirmation_policy: 'ask',
        },
        idempotent_replay: false,
      },
    ]);
    const repository = new ClioRepository(transport);

    await repository.submitMessage('sess 1', {
      behavior: {
        confirmation_policy: 'ask',
        execution_mode: 'execute',
        reasoning_effort: 'high',
      },
      client_message_id: 'client-message-1',
      delivery: 'start',
      idempotency_key: 'message-key-1',
      model: { provider_id: 'claude_code', model_id: 'sonnet' },
      parts: [{ type: 'text', text: 'Use Sonnet.' }],
    });

    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/sess%201/messages',
      body: {
        behavior: {
          confirmation_policy: 'ask',
          execution_mode: 'execute',
          reasoning_effort: 'high',
        },
        client_message_id: 'client-message-1',
        delivery: 'start',
        idempotency_key: 'message-key-1',
        model: { provider_id: 'claude_code', model_id: 'sonnet' },
        parts: [{ type: 'text', text: 'Use Sonnet.' }],
      },
    });
  });

  it('decodes service-owned administrative catalogs and diagnostics', async () => {
    const transport = new RecordingTransport([
      { expert_packs: [] },
      { policies: [{ scope: 'workspace', action: 'allow', tool_name_pattern: '*' }] },
      { policies: [{ scope: 'workspace', action: 'ask', tool_name_pattern: 'shell_*' }] },
      { backend: 'declarative', enabled: true, hooks: [], recent_invocations: [] },
      {
        cache: { hits: 2, misses: 1, hit_rate: 2 / 3, capacity: 1000 },
        session: null,
        global: { conversations_total: 4, invocations_total: 9 },
        metadata: {},
      },
      {
        healthy: true,
        uptime_s: 12,
        overall_status: 'ready',
        integrations: [{ name: 'api', status: 'ready' }],
        tool_hooks_installed: null,
      },
      {
        uptime_s: 12,
        sessions: { total: 3, active: 1, by_status: { idle: 1 } },
        messages: { total: 7, by_role: { user: 4, assistant: 3 } },
        tokens: { input_total: 10, output_total: 5 },
        cost: { total_usd: 0 },
        latencies: {},
      },
    ]);
    const repository = new ClioRepository(transport);

    expect(await repository.expertPacks()).toEqual([]);
    expect((await repository.policies())[0]?.action).toBe('allow');
    await repository.updatePolicies([
      {
        scope: 'workspace',
        action: 'ask',
        tool_name_pattern: 'shell_*',
        metadata: { ignored: true },
      },
    ]);
    expect((await repository.hooks()).backend).toBe('declarative');
    expect((await repository.memoryStatistics()).cache.hits).toBe(2);
    const serviceHealth = await repository.serviceHealth();
    expect(serviceHealth.integrations[0]?.status).toBe('ready');
    expect(serviceHealth.tool_hooks_installed).toBeUndefined();
    expect((await repository.runtimeMetrics()).tokens.cache_read_total).toBe(0);

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/expert-packs' },
      { method: 'GET', path: '/v1/policies' },
      { method: 'PUT', path: '/v1/policies' },
      { method: 'GET', path: '/v1/hooks' },
      { method: 'GET', path: '/v1/memory/stats' },
      { method: 'GET', path: '/v1/health' },
      { method: 'GET', path: '/v1/metrics' },
    ]);
    expect(transport.requests[2]?.body).toEqual({
      policies: [{ scope: 'workspace', action: 'ask', tool_name_pattern: 'shell_*' }],
    });
  });

  it('uses authoritative workspace and session lifecycle routes', async () => {
    const workspace = {
      id: 'ws_1',
      name: 'campaign',
      display_name: 'campaign',
      path: 'D:\\science\\campaign',
      connection_id: 'local',
      pinned: true,
    };
    const session = {
      id: 'sess_1',
      workspace_id: 'ws_1',
      title: 'Evidence review',
      state: 'completed',
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T00:00:00Z',
      pinned: true,
      archived: false,
    };
    const transport = new RecordingTransport([
      workspace,
      workspace,
      undefined,
      session,
      session,
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await repository.createWorkspace({
      name: 'campaign',
      root_path: 'D:\\science\\campaign',
      pinned: true,
    });
    await repository.updateWorkspace('ws 1', { name: 'Campaign', pinned: false });
    await repository.deleteWorkspace('ws 1');
    await repository.createSession({
      workspace_id: 'ws_1',
      title: 'Evidence review',
      pinned: true,
      mode: 'plan',
      routing_mode: 'experts',
      approval_mode: 'spotter-ai',
    });
    await repository.updateSession('sess 1', { title: 'Reviewed evidence', archived: true });
    await repository.deleteSession('sess 1');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/workspaces',
        body: { name: 'campaign', root_path: 'D:\\science\\campaign', metadata: { pinned: true } },
      },
      {
        method: 'PATCH',
        path: '/v1/workspaces/ws%201',
        body: { name: 'Campaign', metadata: { pinned: false } },
      },
      { method: 'DELETE', path: '/v1/workspaces/ws%201', body: undefined },
      {
        method: 'POST',
        path: '/v1/sessions',
        body: {
          workspace_id: 'ws_1',
          title: 'Evidence review',
          metadata: { pinned: true },
          mode: 'plan',
          routing_mode: 'experts',
          approval_mode: 'spotter-ai',
        },
      },
      {
        method: 'PATCH',
        path: '/v1/sessions/sess%201',
        body: { title: 'Reviewed evidence', archived: true },
      },
      { method: 'DELETE', path: '/v1/sessions/sess%201', body: undefined },
    ]);
  });

  it('manages scheduled work through the owning session routes', async () => {
    const scheduledTurn = {
      id: 'schedule_1',
      session_id: 'sess 1',
      question: 'Review the latest station evidence.',
      enabled: true,
      created_at: '2026-08-23T10:00:00Z',
      cron: '0 9 * * 1-5',
      timezone: 'America/Chicago',
      recurring: true,
      run_at: '',
      next_fire_at: '2026-08-24T14:00:00Z',
      last_fired_at: '',
      fire_count: 0,
      max_fires: 0,
      until: '',
      overlap_policy: 'queue',
      retry_count: 0,
      last_error: '',
      disabled_reason: '',
    };
    const transport = new RecordingTransport([
      { schedules: [scheduledTurn], cron_timezone: 'America/Chicago' },
      scheduledTurn,
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.scheduledTurns('sess 1')).resolves.toMatchObject({
      timezone: 'America/Chicago',
      schedules: [{ id: 'schedule_1', recurring: true }],
    });
    await repository.createScheduledTurn('sess 1', {
      question: 'Review the latest station evidence.',
      cron: '0 9 * * 1-5',
      timezone: 'America/Chicago',
      recurring: true,
      overlap_policy: 'queue',
    });
    await repository.deleteScheduledTurn('schedule 1');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'GET',
        path: '/v1/sessions/sess%201/schedules',
        body: undefined,
      },
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/schedules',
        body: {
          question: 'Review the latest station evidence.',
          cron: '0 9 * * 1-5',
          timezone: 'America/Chicago',
          recurring: true,
          overlap_policy: 'queue',
        },
      },
      { method: 'DELETE', path: '/v1/schedules/schedule%201', body: undefined },
    ]);
  });

  it('reads and updates service-owned session defaults', async () => {
    const defaults = {
      provider_id: 'codex',
      model_id: 'gpt-5.6-luna',
      effort: 'medium',
      mode: 'architect',
      edit_mode: 'diff',
      routing_mode: 'experts',
      approval_mode: 'ai-review',
      blueprint_id: 'earthscope-review',
    };
    const transport = new RecordingTransport([defaults, { ...defaults, mode: 'edit' }]);
    const repository = new ClioRepository(transport);

    await expect(repository.sessionDefaults()).resolves.toEqual(defaults);
    await expect(repository.updateSessionDefaults({ mode: 'edit' })).resolves.toMatchObject({
      mode: 'edit',
    });
    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'GET', path: '/v1/session-defaults', body: undefined },
      { method: 'PATCH', path: '/v1/session-defaults', body: { mode: 'edit' } },
    ]);
  });

  it('updates live session behavior through the authoritative session route', async () => {
    const updated = {
      id: 'sess_1',
      workspace_id: 'ws_1',
      title: 'Evidence review',
      state: 'running',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:01:00Z',
      mode: 'plan',
      edit_mode: 'patch',
      routing_mode: 'experts',
      approval_mode: 'ai-review',
      pinned: false,
      archived: false,
    };
    const transport = new RecordingTransport([updated]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.updateSession('sess 1', {
        mode: 'plan',
        edit_mode: 'patch',
        routing_mode: 'experts',
        approval_mode: 'ai-review',
        provider_id: 'claude_code',
        model_id: 'sonnet',
      }),
    ).resolves.toMatchObject(updated);
    expect(transport.requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/v1/sessions/sess%201',
      body: {
        mode: 'plan',
        edit_mode: 'patch',
        routing_mode: 'experts',
        approval_mode: 'ai-review',
        model: { provider_id: 'claude_code', model_id: 'sonnet' },
      },
    });
  });

  it('round-trips portable sessions through the authoritative export and import routes', async () => {
    const exported = { version: '1', session: { id: 'sess_1' }, messages: [] };
    const imported = {
      id: 'sess_imported',
      workspace_id: 'ws_1',
      title: 'Imported evidence',
      state: 'completed',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
      pinned: false,
      archived: false,
    };
    const transport = new RecordingTransport([exported, imported]);
    const repository = new ClioRepository(transport);

    await expect(repository.exportSession('sess 1')).resolves.toEqual(exported);
    await expect(repository.importSession(exported)).resolves.toMatchObject(imported);
    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'GET', path: '/v1/sessions/sess%201/export', body: undefined },
      { method: 'POST', path: '/v1/sessions/import', body: exported },
    ]);
  });
});
