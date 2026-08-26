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

  it('sends the selected model through the canonical GACT message envelope', async () => {
    const transport = new RecordingTransport([{ message_id: 'message_1', run_id: 'run_1' }]);
    const repository = new ClioRepository(transport);

    await repository.sendMessage('sess 1', 'Use Sonnet.', {
      provider_id: 'claude_code',
      model_id: 'sonnet',
      effort: 'high',
    });

    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/sess%201/messages',
      body: {
        text: 'Use Sonnet.',
        model: { provider_id: 'claude_code', model_id: 'sonnet' },
        metadata: { effort: 'high' },
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

  it('activates a blueprint explicitly after session creation', async () => {
    const transport = new RecordingTransport([{ session_id: 'sess_1', blueprint_id: 'earth' }]);
    const repository = new ClioRepository(transport);

    await repository.setSessionAgentBlueprint('sess 1', 'earth');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/agent-blueprint',
        body: { blueprint_id: 'earth' },
      },
    ]);
  });

  it('persists an explicit blueprint source edit in its resolved scope', async () => {
    const transport = new RecordingTransport([
      {
        entry: { path: 'experts/operator.md', type: 'file', size: 22 },
        validation: { validation_errors: [], validation_warnings: ['Review tool access'] },
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.writeAgentBlueprintFile(
        'operator pack',
        'experts/operator.md',
        '# Cluster operator',
        { workspaceId: 'workspace 1', sessionId: 'session 1' },
      ),
    ).resolves.toEqual({
      entry: { path: 'experts/operator.md', type: 'file', size: 22 },
      validation_errors: [],
      validation_warnings: ['Review tool access'],
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'PUT',
      path: '/v1/agent-blueprints/operator%20pack/files/write?path=experts%2Foperator.md&workspace_id=workspace+1&session_id=session+1',
      body: { content: '# Cluster operator' },
    });
  });

  it('uses authoritative branching and history mutation routes', async () => {
    const forked = {
      id: 'sess_fork',
      workspace_id: 'ws_1',
      title: 'Evidence review branch',
      state: 'interrupted',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
      pinned: false,
      archived: false,
    };
    const transport = new RecordingTransport([
      forked,
      {
        session_id: 'sess 1',
        operation: 'undo',
        deleted_message_ids: ['message_3'],
        message_count: 2,
      },
      {
        session_id: 'sess 1',
        operation: 'rewind',
        deleted_message_ids: ['message_2', 'message_3'],
        message_count: 1,
      },
      {
        session_id: 'sess 1',
        compacted: true,
        summary_message_id: 'message_summary',
      },
    ]);
    const repository = new ClioRepository(transport);

    await repository.forkSession('sess 1', { at_message_id: 'message 1' });
    await repository.undoSession('sess 1', 1);
    await repository.rewindSession('sess 1', 'message 1', true);
    await repository.compactSession('sess 1');

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/fork',
        body: { at_message_id: 'message 1' },
      },
      { method: 'POST', path: '/v1/sessions/sess%201/undo', body: { count: 1 } },
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/rewind',
        body: { message_id: 'message 1', include_target: true },
      },
      { method: 'POST', path: '/v1/sessions/sess%201/compact', body: {} },
    ]);
  });

  it('reads operational runs from the run registry and normalizes live states', async () => {
    const transport = new RecordingTransport([
      {
        runs: [
          {
            handle_id: 'task_1',
            task_id: 'task_1',
            run_label: 'Data expert',
            live_state: 'input_required',
            status: 'input_required',
            host: 'local',
            placement: 'local',
            parent_session_id: 'sess_parent',
            child_session_id: 'sess_child',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            detached: false,
            source: 'agent_task',
            ticker: {
              state: 'input_required',
              updated_at: '2026-08-22T00:01:00Z',
              path: '/v1/agent-tasks/task_1/live',
            },
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const runs = await repository.runs();

    expect(transport.requests[0]?.path).toBe('/v1/runs');
    expect(runs[0]).toMatchObject({
      handle_id: 'task_1',
      live_state: 'waiting_user',
      ticker: { state: 'waiting_user' },
    });
  });

  it('reads file and context snapshots from their authoritative workspace routes', async () => {
    const transport = new RecordingTransport([
      { entries: [{ path: 'results/plot.png', type: 'file', size: 42 }] },
      {
        session_id: 'sess_1',
        scope: 'main',
        window_tokens: 262144,
        live_tokens: 1200,
        used_tokens: null,
        autocompact_pct: 0.85,
        live_block_count: 3,
        categories: { tools: 200, observations: 1000 },
      },
    ]);
    const repository = new ClioRepository(transport);

    const files = await repository.workspaceFiles('ws 1');
    const context = await repository.contextState('sess_1', 'main');

    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/workspaces/ws%201/files',
      '/v1/sessions/sess_1/context/state?scope=main',
    ]);
    expect(files).toEqual([{ path: 'results/plot.png', type: 'file', size: 42 }]);
    expect(context).toMatchObject({
      session_id: 'sess_1',
      scope: 'main',
      used_tokens: undefined,
      limit_tokens: 262144,
      live_tokens: 1200,
      provenance: { source: 'server', stale: false },
    });
  });

  it('reads session evidence and process truth from their scoped routes', async () => {
    const transport = new RecordingTransport([
      {
        diffs: [
          {
            path: 'src/analysis.py',
            status: 'pending',
            applied: false,
            unified_diff: '@@ -1 +1 @@',
          },
        ],
      },
      { files: [{ path: 'notes.md', mode: 'pin', size: 42 }] },
      {
        frames: [
          {
            id: 'frame_1',
            session_id: 'sess_1',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            status: 'completed',
            items: [
              {
                kind: 'context_file',
                source_id: 'notes.md',
                included: true,
                tokens_estimated: 11,
              },
            ],
            tokens_estimated: 11,
          },
        ],
      },
      {
        processes: [
          {
            kind: 'mcp-task',
            id: 'jarvis_1',
            title: 'Run analysis on Ares',
            live_state: 'working',
            status: 'working',
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:01:00Z',
            server_id: 'relay-ares',
          },
          {
            kind: 'agent',
            id: 'task_interrupted',
            title: 'Interrupted child',
            live_state: 'failed',
            status: 'failed',
            result: null,
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const [diffs, files, frames, processes] = await Promise.all([
      repository.sessionDiffs('sess 1'),
      repository.contextFiles('sess 1'),
      repository.contextFrames('sess 1'),
      repository.asyncProcesses('sess 1'),
    ]);

    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/sessions/sess%201/diffs',
      '/v1/sessions/sess%201/context/files',
      '/v1/sessions/sess%201/context/frames',
      '/v1/sessions/sess%201/async-processes',
    ]);
    expect(diffs[0]).toMatchObject({ path: 'src/analysis.py', status: 'pending' });
    expect(files[0]).toMatchObject({ display_path: 'notes.md', mode: 'pin' });
    expect(frames[0]).toMatchObject({ status: 'completed', tokens_estimated: 11 });
    expect(processes[0]).toMatchObject({
      title: 'Run analysis on Ares',
      live_state: 'running',
      metadata: { server_id: 'relay-ares' },
    });
    expect(processes[1]).toMatchObject({
      id: 'task_interrupted',
      live_state: 'failed',
      result: undefined,
    });
  });

  it('loads artifact history and lineage and exports an evidence crate', async () => {
    const version = {
      artifact_id: 'artifact_1',
      workspace_id: 'ws_1',
      name: 'result.csv',
      version: 1,
      kind: 'data',
      custody: 'cas',
      mechanism: 'tool-declared',
      evidence_class: 'strong',
      sha256: 'abc',
      size_bytes: 12,
      authority: 'tool',
      path: 'result.csv',
      created_at: '2026-08-23T00:00:00Z',
      producer: { session_id: 'sess_1', call_id: 'call_1' },
      uri: 'artifact://ws_1/result.csv@v1',
      fetch_url: '/v1/artifacts/artifact_1/bytes',
    };
    const detail = {
      artifact: {
        workspace_id: 'ws_1',
        name: 'result.csv',
        kind: 'data',
        latest_version: 1,
        head_artifact_id: 'artifact_1',
        aliases: { latest: 1 },
        versions: [version],
      },
      resolved: version,
    };
    const lineage = {
      root: 'artifact_1',
      direction: 'both',
      depth: 5,
      nodes: [
        { id: 'artifact_1', type: 'artifact', name: 'result.csv', version: 1 },
        { id: 'activity:call_1', type: 'activity', tool: 'Analyze data' },
      ],
      edges: [
        { from: 'activity:call_1', to: 'artifact_1', type: 'generated', evidence: 'declared' },
      ],
      truncated: null,
    };
    const bundle = new Uint8Array([80, 75, 3, 4]);
    const transport = new RecordingTransport([detail, lineage, bundle]);
    const repository = new ClioRepository(transport);

    await expect(repository.artifactDetail('artifact 1')).resolves.toMatchObject(detail);
    await expect(repository.artifactLineage('artifact 1')).resolves.toMatchObject({
      root: 'artifact_1',
      nodes: lineage.nodes,
      edges: lineage.edges,
    });
    await expect(repository.exportArtifact('artifact 1')).resolves.toEqual(bundle);
    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
      { path: '/v1/artifacts/artifact%201', responseType: undefined },
      {
        path: '/v1/artifacts/artifact%201/lineage?direction=both&depth=5',
        responseType: undefined,
      },
      { path: '/v1/artifacts/artifact%201/export', responseType: 'bytes' },
    ]);
  });

  it('walks the authoritative session artifact registry including child outputs and used inputs', async () => {
    const version = (id: string, name: string, sessionId: string) => ({
      artifact_id: id,
      workspace_id: 'ws_1',
      name,
      version: 1,
      kind: 'dataset',
      custody: 'cas',
      mechanism: 'tool-schema',
      evidence_class: 'hashed-at-use',
      created_at: '2026-08-24T00:00:00Z',
      producer: { session_id: sessionId },
      custody_gap: { reason: 'relink_by_hash' },
      uri: `artifact://ws_1/${name}@v1`,
      fetch_url: `/v1/artifacts/${id}/bytes`,
    });
    const record = (id: string, name: string, sessionId: string) => ({
      workspace_id: 'ws_1',
      name,
      kind: 'dataset',
      latest_version: 1,
      head_artifact_id: id,
      aliases: { latest: 1 },
      versions: [version(id, name, sessionId)],
      producing_session_ids: [sessionId],
    });
    const transport = new RecordingTransport([
      {
        artifacts: [record('artifact_plot', 'plot.png', 'child_1')],
        used: [record('artifact_csv', 'input.csv', 'source_1')],
        count: 2,
        include_children: true,
        child_session_ids: ['child_1'],
        next_cursor: 'artifact_plot',
      },
      {
        artifacts: [record('artifact_report', 'report.md', 'sess_1')],
        used: [record('artifact_csv', 'input.csv', 'source_1')],
        count: 2,
        include_children: true,
        child_session_ids: ['child_1'],
        next_cursor: null,
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.sessionArtifacts('sess 1')).resolves.toMatchObject({
      artifacts: [{ name: 'plot.png' }, { name: 'report.md' }],
      used: [{ name: 'input.csv' }],
      count: 2,
      include_children: true,
      child_session_ids: ['child_1'],
    });
    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/v1/sessions/sess%201/artifacts?include_children=true&include_used=true&limit=200',
      '/v1/sessions/sess%201/artifacts?include_children=true&include_used=true&limit=200&before=artifact_plot',
    ]);
  });

  it('normalizes the server permission ledger without flattening away the input', async () => {
    const transport = new RecordingTransport([
      {
        permissions: [
          {
            id: 'perm_1',
            session_id: 'sess_1',
            tool_call: { tool_name: 'shell.exec', input: { cmd: 'inspect workspace' } },
            summary: 'Run a protected command',
            created_at: '2026-08-22T00:00:00Z',
            status: 'pending',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const approvals = await repository.pendingApprovals('sess_1');

    expect(transport.requests[0]?.path).toBe('/v1/permissions?session_id=sess_1&status=pending');
    expect(approvals).toEqual([
      {
        id: 'perm_1',
        session_id: 'sess_1',
        tool_name: 'shell.exec',
        input: { cmd: 'inspect workspace' },
        summary: 'Run a protected command',
        reason: undefined,
        risk: undefined,
        status: 'pending',
        created_at: '2026-08-22T00:00:00Z',
      },
    ]);
  });

  it('uses the authoritative permission and question mutation routes', async () => {
    const question = {
      id: 'question_1',
      session_id: 'sess_1',
      prompt: 'Continue?',
      status: 'answered',
      kind: 'confirmation',
      options: [],
      selected_options: ['continue'],
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T00:01:00Z',
    };
    const transport = new RecordingTransport([undefined, question]);
    const repository = new ClioRepository(transport);

    await repository.respondPermission('perm_1', 'allow_session');
    await repository.answerQuestion('sess_1', 'question_1', {
      selected_options: ['continue'],
    });

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/permissions/perm_1',
        body: { action: 'allow_session' },
      },
      {
        method: 'POST',
        path: '/v1/sessions/sess_1/questions/question_1/answer',
        body: { selected_options: ['continue'] },
      },
    ]);
  });

  it('retries a recoverable response through the authoritative attempt route', async () => {
    const attempt = {
      id: 'attempt_1',
      session_id: 'sess_1',
      source_message_id: 'message failed',
      status: 'queued',
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T00:00:00Z',
      model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
    };
    const transport = new RecordingTransport([attempt]);
    const repository = new ClioRepository(transport);

    const result = await repository.retryTurn('sess 1', 'message failed', {
      execute: true,
      provider_id: 'codex',
      model_id: 'gpt-5.6-luna',
    });

    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/sess%201/messages/message%20failed/retry',
      body: {
        execute: true,
        provider_id: 'codex',
        model_id: 'gpt-5.6-luna',
      },
    });
    expect(result).toEqual(attempt);
  });
});
