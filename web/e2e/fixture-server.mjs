import { createServer } from 'node:http';
import {
  behavior,
  observedAt,
  pendingSteer,
  providerCatalog,
  readyResource,
  sessionId,
  workspaceId,
} from './fixture-data.mjs';

const port = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid CLIO_FIXTURE_PORT: ${process.env['CLIO_FIXTURE_PORT'] ?? ''}`);
}
const streamMessageId = 'msg_stream';
const streamBlockId = 'block_stream';
let permissionPending = true;
let questionPending = true;
let streamedText = '';
let streamStarted = false;
let nextCursor = 1;
let queuedMessages = [];
const streamClients = new Set();
const artifactPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8wNAAAAAElFTkSuQmCC',
  'base64',
);

const capabilities = {
  contract_version: '0.2',
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

const artifactRecord = {
  workspace_id: workspaceId,
  name: 'vertical-displacement.png',
  kind: 'image/png',
  latest_version: 1,
  head_artifact_id: 'artifact_plot',
  aliases: {},
  producing_session_ids: [sessionId],
  versions: [
    {
      artifact_id: 'artifact_plot',
      workspace_id: workspaceId,
      name: 'vertical-displacement.png',
      version: 1,
      kind: 'image/png',
      custody: 'fixture',
      mechanism: 'fixture_capture',
      evidence_class: 'test_owned',
      sha256: 'fixture-vertical-displacement-v1',
      size_bytes: artifactPng.length,
      created_at: observedAt,
      producer: { session_id: sessionId },
      uri: 'artifact://flat-ndp/vertical-displacement.png@v1',
      fetch_url: '/v1/artifacts/artifact_plot/bytes',
    },
  ],
};

/** Resources the fixture holds, keyed by id: the seeded one plus any uploaded. */
let resources = new Map();

function seedResources() {
  resources = new Map([[readyResource.id, { record: { ...readyResource }, bytes: Buffer.alloc(0) }]]);
}
seedResources();

/** Build one durable queued message using the explicit GACT 0.3 composer contract. */
function queuedMessage(id, text, position) {
  return {
    id,
    session_id: sessionId,
    revision: 1,
    position,
    parts: [{ type: 'text', text }],
    metadata: {},
    client_message_id: id,
    idempotency_key: id,
    behavior,
    model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
    created_at: observedAt,
    updated_at: observedAt,
  };
}

/** Seed a compact stack long enough to exercise the queue's visual edge fade. */
function seedQueuedMessages() {
  queuedMessages = [
    queuedMessage('queue_current', 'Currently it renders as a static card.', 0),
    queuedMessage('queue_annotation_1', 'Review the first annotation.', 1),
    queuedMessage('queue_annotation_2', 'Review the second annotation.', 2),
    queuedMessage('queue_pdf', 'Check why the PDF viewer is always paged.', 3),
    queuedMessage('queue_annotation_3', 'Review the attachment processing semantics.', 4),
    queuedMessage('queue_annotation_4', 'Keep the queue compact while work continues.', 5),
  ];
}

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
        text:
          index === 0
            ? 'Sanitized **evidence ledger** entry 1.'
            : `Sanitized evidence ledger entry ${index + 1}.`,
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
      'Authorization, Content-Type, Last-Event-ID, Upload-Offset, X-A2UI-Version, X-GACT-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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

/** Read one bounded JSON request body from the local browser fixture. */
async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('fixture request body is too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * How the service derives an envelope's `entity_id` from its payload, per
 * event family. Mirrored from the reference backend rather than hand-annotated
 * per call site, so the fixture cannot drift into naming an entity the service
 * would not name — `queued_message.reordered` carries a list and no id, and the
 * `stream.*` family has no entity at all.
 */
const ENTITY_KEYS_BY_FAMILY = {
  message: ['message_id', 'id'],
  pending_steer: ['message_id', 'id'],
  provider_catalog: ['catalog_id', 'id'],
  queued_message: ['queued_message_id', 'id'],
  resource: ['resource_id', 'id'],
  session: ['session_id'],
};

function entityIdFor(type, payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const family = type.split('.')[0];
  for (const key of ENTITY_KEYS_BY_FAMILY[family] ?? ['id']) {
    const value = payload[key];
    if (value) return String(value);
  }
  return undefined;
}

/**
 * Build the canonical scoped GACT 0.3 envelope used by the SSE fixture.
 *
 * `entity_revision` is the service's own event sequence and rides on EVERY
 * frame, including the connection preamble; `entity_id` rides only where the
 * service can derive one. Both are what the recorded golden frames carry, and
 * the client's per-entity ordering guard reads them.
 */
function envelope(type, payload, revision) {
  const entityId = entityIdFor(type, payload);
  return {
    protocol_version: '0.3',
    type,
    occurred_at: new Date().toISOString(),
    scope: {
      connection_id: 'fixture',
      workspace_id: workspaceId,
      session_id: sessionId,
    },
    ...(entityId === undefined ? {} : { entity_id: entityId }),
    entity_revision: revision,
    payload,
  };
}

/** Publish one ordered event to every currently focused session stream. */
function publish(type, payload) {
  const cursor = nextCursor++;
  const frame = JSON.stringify(envelope(type, payload, cursor));
  const block = `id: ${cursor}\nevent: ${type}\ndata: ${frame}\n\n`;
  for (const client of streamClients) client.write(block);
}

const RESOURCE_PREFIX = `/v1/workspaces/${workspaceId}/resources/`;

/** The resource id one `/resources/{id}` path names, or undefined. */
function resourcePath(pathname) {
  if (!pathname.startsWith(RESOURCE_PREFIX)) return undefined;
  const rest = pathname.slice(RESOURCE_PREFIX.length);
  return rest.includes('/') ? undefined : decodeURIComponent(rest);
}

/** The resource id one `/resources/{id}/content` path names, or undefined. */
function resourceContentPath(pathname) {
  if (!pathname.startsWith(RESOURCE_PREFIX) || !pathname.endsWith('/content')) return undefined;
  const rest = pathname.slice(RESOURCE_PREFIX.length, -'/content'.length);
  return rest.includes('/') ? undefined : decodeURIComponent(rest);
}

/** Read one bounded raw request body. */
async function readBytes(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw new Error('fixture upload body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Register one resource, resuming an upload the fixture already holds.
 *
 * `client_upload_id` is the client's own fingerprint of the file, so a repeated
 * create is an idempotent replay that reports how many bytes are already in
 * custody rather than starting a second resource.
 */
function createResource(body) {
  const existing = [...resources.values()].find(
    (entry) =>
      body.client_upload_id && entry.record.client_upload_id === String(body.client_upload_id),
  );
  if (existing) return { ...existing.record, idempotent_replay: true, upload_url: uploadUrl(existing.record.id) };
  const id = `res_upload_${resources.size + 1}`;
  const now = new Date().toISOString();
  const record = {
    id,
    workspace_id: workspaceId,
    client_upload_id: String(body.client_upload_id ?? ''),
    revision: 1,
    name: String(body.name ?? 'attachment'),
    claimed_mime: String(body.media_type ?? 'application/octet-stream'),
    detected_mime: '',
    detection_source: '',
    declared_size: Number(body.size ?? 0),
    received_size: 0,
    sha256: '',
    state: 'uploading',
    failure: '',
    created_at: now,
    updated_at: now,
    completed_at: '',
    mime_mismatch: false,
  };
  const entry = { record, bytes: Buffer.alloc(0) };
  resources.set(id, entry);
  publish('resource.created', record);
  // An empty file has no chunk to deliver, so custody registers it right away
  // rather than leaving the client polling an upload that can never advance.
  if (record.declared_size === 0) finalizeResource(entry);
  return { ...record, idempotent_replay: false, upload_url: uploadUrl(id) };
}

function uploadUrl(id) {
  return `/v1/workspaces/${workspaceId}/resources/${id}/content`;
}

/** Close one upload the way custody does: detect, hash, stamp, announce. */
function finalizeResource(entry) {
  const now = new Date().toISOString();
  entry.record.state = 'ready';
  entry.record.detected_mime = entry.record.claimed_mime;
  entry.record.detection_source = 'content_sniff';
  entry.record.sha256 = `fixture-${entry.record.id}-sha256`;
  entry.record.completed_at = now;
  entry.record.updated_at = now;
  publish('resource.ready', entry.record);
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

const server = createServer(async (request, response) => {
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
    queuedMessages = [];
    seedResources();
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/queue-demo') {
    seedQueuedMessages();
    sendJson(response, { queued_messages: queuedMessages }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/queue-append') {
    const message = queuedMessage(
      `queue_live_${queuedMessages.length}`,
      'New server update joined the queue.',
      queuedMessages.length,
    );
    queuedMessages.push(message);
    // The service publishes the row itself, not a wrapper — that is what gives
    // the envelope its `entity_id`.
    publish('queued_message.created', message);
    sendJson(response, { queued_message: message }, 202);
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
  if (request.method === 'GET' && url.pathname === '/v1/health') {
    sendJson(response, {
      healthy: true,
      uptime_s: 1,
      overall_status: 'healthy',
      integrations: [],
      tool_hooks_installed: true,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/relay/status') {
    sendJson(response, {
      configured: false,
      configuration_scope: 'none',
      can_manage: false,
      reachable: false,
      checked_at: observedAt,
      reason: 'Not configured for this test-owned fixture.',
      details: {},
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/mcp/servers') {
    sendJson(response, { servers: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/commands') {
    sendJson(response, { commands: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/provenance/providers') {
    sendJson(response, {
      schema_version: '1.0',
      default_provider: 'native',
      providers: [
        {
          name: 'native',
          configured: false,
          queryable: false,
          durable: false,
          status: 'unavailable',
          source: 'test-owned fixture',
          health: { status: 'unavailable' },
        },
      ],
    });
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
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/queued-messages`) {
    sendJson(response, { queued_messages: queuedMessages });
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/sessions/${sessionId}/queued-messages/reorder`
  ) {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, { detail: error instanceof Error ? error.message : 'invalid JSON' }, 400);
      return;
    }
    const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids : [];
    const currentIds = new Set(queuedMessages.map((message) => message.id));
    const requestedIds = new Set(orderedIds);
    if (
      orderedIds.length !== queuedMessages.length ||
      requestedIds.size !== currentIds.size ||
      orderedIds.some((id) => typeof id !== 'string' || !currentIds.has(id))
    ) {
      sendJson(response, { detail: 'queued message reorder set does not match server state' }, 409);
      return;
    }
    const byId = new Map(queuedMessages.map((message) => [message.id, message]));
    // The client sends the revision it believes each row is at. Ignoring that
    // map made the conflict path unreachable from a test, so a drag started
    // against a stale queue could never be exercised.
    const expected = body.revisions && typeof body.revisions === 'object' ? body.revisions : {};
    const stale = queuedMessages.find((message) => expected[message.id] !== message.revision);
    if (stale) {
      sendJson(
        response,
        {
          detail: {
            error: 'revision_conflict',
            message: 'queued message changed on the server',
            current: stale,
          },
        },
        409,
      );
      return;
    }
    queuedMessages = orderedIds.map((id, position) => {
      const message = byId.get(id);
      return {
        ...message,
        position,
        revision: message.revision + 1,
        updated_at: new Date().toISOString(),
      };
    });
    publish('queued_message.reordered', { queued_messages: queuedMessages });
    sendJson(response, { queued_messages: queuedMessages });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/pending-steers`) {
    sendJson(response, { pending_steers: [pendingSteer] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/workspaces/${workspaceId}/resources`) {
    sendJson(response, { resources: [...resources.values()].map((entry) => entry.record) });
    return;
  }
  if (request.method === 'POST' && url.pathname === `/v1/workspaces/${workspaceId}/resources`) {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, { detail: error instanceof Error ? error.message : 'invalid JSON' }, 400);
      return;
    }
    sendJson(response, createResource(body), 201);
    return;
  }
  if (
    request.method === 'PATCH' &&
    resourceContentPath(url.pathname) !== undefined &&
    resources.has(resourceContentPath(url.pathname))
  ) {
    const entry = resources.get(resourceContentPath(url.pathname));
    const offset = Number.parseInt(request.headers['upload-offset'] ?? '', 10);
    if (!Number.isSafeInteger(offset) || offset !== entry.bytes.length) {
      // The service is authoritative for how many bytes it holds: a client that
      // resumes from the wrong place must be told, not silently appended to.
      sendJson(
        response,
        { detail: { error: 'upload_offset_conflict', received_size: entry.bytes.length } },
        409,
      );
      return;
    }
    entry.bytes = Buffer.concat([entry.bytes, await readBytes(request)]);
    entry.record.received_size = entry.bytes.length;
    entry.record.updated_at = new Date().toISOString();
    publish('resource.upload_progress', entry.record);
    if (entry.bytes.length >= entry.record.declared_size) finalizeResource(entry);
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'GET' && resources.has(resourcePath(url.pathname))) {
    sendJson(response, resources.get(resourcePath(url.pathname)).record);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/provider-catalog') {
    sendJson(response, providerCatalog);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/artifacts`) {
    sendJson(response, {
      artifacts: [artifactRecord],
      used: [],
      count: 1,
      include_children: true,
      child_session_ids: [],
      next_cursor: null,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/artifacts/artifact_plot') {
    sendJson(response, { artifact: artifactRecord, resolved: artifactRecord.versions[0] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/artifacts/artifact_plot/bytes') {
    response.writeHead(200, {
      ...commonHeaders('image/png'),
      'Content-Length': String(artifactPng.length),
    });
    response.end(artifactPng);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/events`) {
    response.writeHead(200, commonHeaders('text/event-stream'));
    const preamble = envelope('stream.live', { service: 'clio-fixture' }, nextCursor);
    response.write(
      `id: ${nextCursor}\nevent: stream.live\ndata: ${JSON.stringify(preamble)}\n\n`,
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
  // The unscoped read the workspace actually uses: a descendant session can
  // raise a question, so the surface asks for every session's, filtered by
  // status, rather than only the focused session's.
  if (
    request.method === 'GET' &&
    (url.pathname === '/v1/questions' || url.pathname === `/v1/sessions/${sessionId}/questions`)
  ) {
    const wantsPending = url.searchParams.get('status');
    sendJson(response, {
      questions:
        questionPending && (wantsPending === null || wantsPending === 'pending')
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
