import { createServer } from 'node:http';

const port = 8799;
const observedAt = '2026-08-22T20:00:00.000Z';
const workspaceId = 'ws_flat_ndp';
const sessionId = 'sess_flat_ndp';
const streamMessageId = 'msg_stream';
const streamBlockId = 'block_stream';
let permissionPending = true;
let questionPending = true;
let streamedText = '';
let streamStarted = false;
let nextCursor = 1;
const streamClients = new Set();

const capabilities = {
  gact_versions: ['0.3'],
  a2ui_versions: ['0.9.1'],
  replay: { supported: true, retention: 2048 },
  capabilities: {
    attachments: false,
    approvals: true,
    questions: true,
    files: true,
    context: true,
    a2ui: true,
  },
  degradations: [],
  model_catalog: { source: 'provider', observed_at: observedAt, stale: false },
  active_model: { provider_id: 'codex', model_id: 'gpt-5.6-luna', effort: 'medium' },
};

const workspace = {
  id: workspaceId,
  name: 'flat-NDP',
  display_name: 'flat-NDP',
  path: 'D:\\science\\campaigns\\flat-NDP',
  connection_id: 'fixture',
};

const session = {
  id: sessionId,
  workspace_id: workspaceId,
  title: 'EarthScope NDP evidence review',
  state: 'running',
  created_at: '2026-08-22T19:00:00.000Z',
  updated_at: observedAt,
  provider_id: 'codex',
  model_id: 'gpt-5.6-luna',
  effort: 'medium',
  agent_id: 'main',
};

/** Return a dense sanitized transcript with one active, always-mounted streaming turn. */
function transcriptMessages() {
  const messages = Array.from({ length: 998 }, (_, index) => ({
    id: `msg_history_${String(index).padStart(4, '0')}`,
    session_id: sessionId,
    role: index % 2 === 0 ? 'user' : 'assistant',
    created_at: new Date(Date.parse('2026-08-22T18:00:00.000Z') + index * 1000).toISOString(),
    completed_at: new Date(Date.parse('2026-08-22T18:00:00.000Z') + index * 1000).toISOString(),
    blocks: [
      {
        id: `block_history_${String(index).padStart(4, '0')}`,
        type: 'text',
        text: `Sanitized evidence ledger entry ${index + 1}.`,
      },
    ],
  }));
  messages.push({
    id: 'msg_fixture_request',
    session_id: sessionId,
    role: 'user',
    created_at: '2026-08-22T19:59:58.000Z',
    completed_at: '2026-08-22T19:59:58.000Z',
    blocks: [
      {
        id: 'block_fixture_request',
        type: 'text',
        text: 'Review the EarthScope station evidence and keep provenance visible.',
      },
    ],
  });
  messages.push({
    id: streamMessageId,
    session_id: sessionId,
    role: 'assistant',
    created_at: '2026-08-22T19:59:59.000Z',
    completed_at: streamStarted && streamedText.includes('delta-99') ? observedAt : undefined,
    blocks: [
      {
        id: 'block_reasoning',
        type: 'reasoning',
        text: 'Compare station coverage, quality flags, and the derived displacement series.',
        streaming: false,
      },
      { id: 'block_tool', type: 'tool', tool_id: 'tool_earthscope' },
      { id: 'block_task', type: 'task', task_id: 'task_quality' },
      { id: 'block_subagent', type: 'subagent', subagent_id: 'subagent_station' },
      { id: 'block_artifact', type: 'artifact', artifact_id: 'artifact_plot' },
      {
        id: streamBlockId,
        type: 'text',
        text: streamedText,
        streaming: !streamedText.includes('delta-99'),
      },
    ],
  });
  return messages;
}

/** Apply the CORS and version headers used by every fixture response. */
function commonHeaders(contentType = 'application/json') {
  return {
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Last-Event-ID, X-A2UI-Version, X-GACT-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'X-GACT-Version': '0.3',
  };
}

/** Send one JSON response with fixture-wide transport headers. */
function sendJson(response, body, status = 200) {
  response.writeHead(status, commonHeaders());
  response.end(JSON.stringify(body));
}

/** Build the canonical scoped GACT 0.3 envelope used by the SSE fixture. */
function envelope(type, payload) {
  return {
    protocol_version: '0.3',
    type,
    occurred_at: new Date().toISOString(),
    scope: {
      connection_id: 'fixture',
      workspace_id: workspaceId,
      session_id: sessionId,
    },
    payload,
  };
}

/** Publish one ordered event to every currently focused session stream. */
function publish(type, payload) {
  const cursor = String(nextCursor++);
  const block = `id: ${cursor}\nevent: ${type}\ndata: ${JSON.stringify(envelope(type, payload))}\n\n`;
  for (const client of streamClients) client.write(block);
}

/** Run the test-owned 100-delta-per-second stream exactly once. */
function startHighRateStream() {
  if (streamStarted) return;
  streamStarted = true;
  let index = 0;
  const timer = setInterval(() => {
    const delta = `delta-${index} `;
    streamedText += delta;
    publish('message.block.delta', {
      message_id: streamMessageId,
      block_id: streamBlockId,
      delta,
    });
    index += 1;
    if (index < 100) return;
    clearInterval(timer);
    publish('message.block.completed', {
      message_id: streamMessageId,
      block_id: streamBlockId,
      text: streamedText,
    });
    publish('message.completed', {
      message_id: streamMessageId,
      completed_at: new Date().toISOString(),
    });
  }, 10);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__test/reset') {
    permissionPending = true;
    questionPending = true;
    streamedText = '';
    streamStarted = false;
    nextCursor = 1;
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/start-stream') {
    startHighRateStream();
    sendJson(response, { status: 'started' }, 202);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    sendJson(response, capabilities);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/commands') {
    sendJson(response, { commands: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/workspaces') {
    sendJson(response, { workspaces: [workspace] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/sessions') {
    sendJson(response, { sessions: [session] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/messages`) {
    sendJson(response, {
      messages: transcriptMessages(),
      tools: [
        {
          id: 'tool_earthscope',
          session_id: sessionId,
          name: 'ndp_search_datasets',
          title: 'Search EarthScope catalog',
          state: 'succeeded',
          input: { search_terms: ['earthscope', 'converted'] },
          output: { dataset_id: 'earthscope_stations', staged: false },
          duration_ms: 820,
        },
      ],
      tasks: [
        {
          id: 'task_quality',
          session_id: sessionId,
          title: 'Review station quality',
          state: 'completed',
          detail: 'Evidence retained with source identity.',
        },
      ],
      subagents: [
        {
          id: 'subagent_station',
          session_id: sessionId,
          title: 'Station evidence specialist',
          state: 'completed',
          summary: 'Reviewed coverage without staging data.',
        },
      ],
      artifacts: [
        {
          id: 'artifact_plot',
          session_id: sessionId,
          name: 'vertical-displacement.png',
          media_type: 'image/png',
          uri: 'artifact://flat-ndp/vertical-displacement.png@v1',
          created_at: observedAt,
        },
      ],
      surfaces: [],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/events`) {
    response.writeHead(200, commonHeaders('text/event-stream'));
    response.write(
      `id: ${nextCursor}\nevent: stream.live\ndata: ${JSON.stringify(envelope('stream.live', {}))}\n\n`,
    );
    nextCursor += 1;
    streamClients.add(response);
    const keepAlive = setInterval(() => response.write(': fixture keep-alive\n\n'), 1000);
    request.on('close', () => {
      clearInterval(keepAlive);
      streamClients.delete(response);
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/providers/lm') {
    sendJson(response, {
      configured: true,
      provider: 'codex',
      api_base: 'codex://app-server',
      model: 'gpt-5.6-luna',
      thinking_level: 'medium',
      thinking_effective: 'medium (budget 8192)',
      presets: [
        {
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          api_base: 'codex://app-server',
          suggested_model: 'gpt-5.6-luna',
          requires_api_key: false,
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: true,
        },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/providers/codex/models') {
    sendJson(response, {
      models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', context_window: 262144 }],
      source: 'provider',
      default_model: 'gpt-5.6-luna',
      generated_at: observedAt,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/permissions') {
    sendJson(response, {
      permissions: permissionPending
        ? [
            {
              id: 'perm_fixture',
              session_id: sessionId,
              tool_call: { tool_name: 'workspace.read', input: { path: 'results/stations.csv' } },
              summary: 'Read the station evidence table',
              reason: 'The agent needs the selected evidence source.',
              risk: 'low',
              created_at: observedAt,
              status: 'pending',
            },
          ]
        : [],
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/permissions/perm_fixture') {
    permissionPending = false;
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/questions`) {
    sendJson(response, {
      questions: questionPending
        ? [
            {
              id: 'question_fixture',
              session_id: sessionId,
              prompt: 'Which evidence view should remain primary?',
              status: 'pending',
              kind: 'choice',
              options: [
                {
                  label: 'Station table',
                  value: 'table',
                  description: 'Keep sortable evidence primary.',
                },
                {
                  label: 'Displacement plot',
                  value: 'plot',
                  description: 'Keep the derived series primary.',
                },
              ],
              selected_options: [],
              created_at: observedAt,
              updated_at: observedAt,
            },
          ]
        : [],
    });
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/sessions/${sessionId}/questions/question_fixture/answer`
  ) {
    questionPending = false;
    sendJson(response, {
      id: 'question_fixture',
      session_id: sessionId,
      prompt: 'Which evidence view should remain primary?',
      status: 'answered',
      kind: 'choice',
      options: [],
      selected_options: ['table'],
      created_at: observedAt,
      updated_at: new Date().toISOString(),
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/state`) {
    sendJson(response, {
      session_id: sessionId,
      scope: 'main',
      window_tokens: 262144,
      live_tokens: 1200,
      used_tokens: 18400,
      autocompact_pct: 0.85,
      live_block_count: 4,
      categories: { evidence: 840, tools: 360 },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/policy`) {
    sendJson(response, {
      session_id: sessionId,
      memory_scope: 'session',
      writable_scope: 'session',
      cross_session_read_available: true,
      cross_session_read_endpoint: `/v1/sessions/${sessionId}/memory/tools/search-sessions`,
      requires_user_consent: true,
      notes: [
        'Conversation retrieval and writes are scoped to the active session.',
        'Cross-session memory tools require explicit user intent or policy.',
        'Other-workspace memory is denied by default.',
      ],
      metadata: { source: 'clio_backend_default' },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/diffs`) {
    sendJson(response, { diffs: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/files`) {
    sendJson(response, {
      files: [
        {
          path: 'results/stations.csv',
          display_path: 'results/stations.csv',
          workspace_id: workspaceId,
          source: 'EarthScope evidence review',
          mode: 'read',
          size: 2048,
          language: 'csv',
          added_at: observedAt,
        },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/frames`) {
    sendJson(response, { frames: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/async-processes`) {
    sendJson(response, { processes: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/workspaces/${workspaceId}/files`) {
    sendJson(response, {
      entries: [
        { path: 'results', type: 'dir' },
        { path: 'results/stations.csv', type: 'file', size: 2048 },
        { path: 'results/vertical-displacement.png', type: 'file', size: 8192 },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/runs') {
    sendJson(response, { runs: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/session-defaults') {
    sendJson(response, {
      provider_id: '',
      model_id: '',
      effort: 'medium',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      blueprint_id: '',
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/agent-blueprints') {
    sendJson(response, { agent_blueprints: [] });
    return;
  }
  if (request.method === 'POST' && url.pathname === `/v1/sessions/${sessionId}/cancel`) {
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }

  sendJson(response, { error: 'not_found', path: url.pathname }, 404);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`CLIO Playwright fixture listening on http://127.0.0.1:${port}\n`);
});
