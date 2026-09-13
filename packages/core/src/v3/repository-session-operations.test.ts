import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('ClioRepository session operation contracts', () => {
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
      {
        entries: [
          { path: '.clio', type: 'dir', internal: true },
          { path: 'results/plot.png', type: 'file', internal: false, size: 42 },
        ],
      },
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
    expect(files).toEqual([{ path: 'results/plot.png', type: 'file', internal: false, size: 42 }]);
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
            root_session_id: 'sess 1',
            owner_session_id: 'sess child',
            task_path: ['task_parent', 'jarvis_1'],
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
      root_session_id: 'sess 1',
      owner_session_id: 'sess child',
      task_path: ['task_parent', 'jarvis_1'],
      metadata: { server_id: 'relay-ares' },
    });
    expect(processes[1]).toMatchObject({
      id: 'task_interrupted',
      live_state: 'failed',
      result: undefined,
      task_path: [],
    });
  });

  it('keeps an unrecognized async-process live state unknown instead of terminally interrupted', async () => {
    const transport = new RecordingTransport([
      {
        processes: [
          {
            kind: 'agent',
            id: 'task_watcher',
            title: 'Spotter watcher',
            live_state: 'waiting',
            status: 'running',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const processes = await repository.asyncProcesses('sess 1');

    expect(processes[0]).toMatchObject({ id: 'task_watcher', live_state: 'unknown' });
  });

  it('reads the newest recorded effective agent toolset without reconstructing it', async () => {
    const transport = new RecordingTransport([
      {
        events: [
          {
            occurred_at: '2026-09-10T11:53:16-05:00',
            payload: {
              agent_id: 'main',
              session_id: 'sess 1',
              tools: [
                {
                  name: 'memory_search_sessions',
                  title: 'Search memory',
                  source: 'native',
                  representation: 'row',
                },
              ],
            },
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const toolset = await repository.effectiveAgentToolset('sess 1');

    expect(transport.requests[0]?.path).toBe(
      '/v1/sessions/sess%201/trace?scope=agent.toolset.recorded&limit=50',
    );
    expect(toolset).toEqual({
      agentId: 'main',
      sessionId: 'sess 1',
      recordedAt: '2026-09-10T11:53:16-05:00',
      tools: [
        {
          name: 'memory_search_sessions',
          title: 'Search memory',
          source: 'native',
          representation: 'row',
        },
      ],
    });
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
