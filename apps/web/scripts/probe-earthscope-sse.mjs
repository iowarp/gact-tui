import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PROMPT =
  "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? " +
  'Pull a real station time series, plot it, and tell me how much to trust the data. ' +
  'Use NDP/EarthScope GNSS station evidence, stage a concrete CSV resource, profile the ' +
  'displacement and uncertainty columns, produce a PNG artifact from the staged CSV, and ' +
  'explain data freshness, coverage, and provenance limitations.';

function parseArgs(argv) {
  const opts = {
    backendUrl: process.env.CLIO_BACKEND_URL || 'http://127.0.0.1:17800',
    provider: process.env.CLIO_DEMO_PROVIDER || 'claude_code',
    model: process.env.CLIO_DEMO_MODEL || 'haiku',
    apiBase: process.env.CLIO_DEMO_API_BASE || 'claude-code://exec',
    transport: process.env.CLIO_DEMO_TRANSPORT || 'exec',
    blueprint: process.env.CLIO_DEMO_BLUEPRINT || 'earthscope-gnss-region',
    prompt: process.env.CLIO_DEMO_PROMPT || DEFAULT_PROMPT,
    outDir:
      process.env.CLIO_SSE_PROBE_OUT ||
      path.join('screenshots', `sse-stream-probe-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    maxWaitMs: Number(process.env.CLIO_SSE_PROBE_MAX_WAIT_MS || 20 * 60_000),
    configureProvider: process.env.CLIO_DEMO_CONFIGURE_PROVIDER !== '0',
    backendAuditLog: process.env.CLIO_STREAM_AUDIT_LOG || '',
    backendSseEventLog: process.env.CLIO_SSE_EVENT_LOG || '',
    sessionId: process.env.CLIO_SSE_PROBE_SESSION_ID || '',
    lastEventId: process.env.CLIO_SSE_PROBE_LAST_EVENT_ID || '',
    postPrompt: process.env.CLIO_SSE_PROBE_NO_POST !== '1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value == null) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--backend-url') opts.backendUrl = next();
    else if (arg === '--provider') opts.provider = next();
    else if (arg === '--model') opts.model = next();
    else if (arg === '--api-base') opts.apiBase = next();
    else if (arg === '--transport') opts.transport = next();
    else if (arg === '--blueprint') opts.blueprint = next();
    else if (arg === '--prompt') opts.prompt = next();
    else if (arg === '--out') opts.outDir = next();
    else if (arg === '--max-wait-ms') opts.maxWaitMs = Number(next());
    else if (arg === '--no-configure-provider') opts.configureProvider = false;
    else if (arg === '--backend-audit-log') opts.backendAuditLog = next();
    else if (arg === '--backend-sse-event-log') opts.backendSseEventLog = next();
    else if (arg === '--session-id') opts.sessionId = next();
    else if (arg === '--last-event-id') opts.lastEventId = next();
    else if (arg === '--no-post') opts.postPrompt = false;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/probe-earthscope-sse.mjs --out screenshots/sse-probe

Environment:
  CLIO_BACKEND_URL=http://127.0.0.1:17800
  CLIO_STREAM_AUDIT_LOG=<backend stream audit jsonl>
  CLIO_SSE_EVENT_LOG=<backend sse write jsonl>
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  opts.outDir = path.resolve(opts.outDir);
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
await fs.mkdir(opts.outDir, { recursive: true });

const receivedPath = path.join(opts.outDir, 'sse-received.jsonl');
const summaryPath = path.join(opts.outDir, 'sse-summary.json');
const messagesPath = path.join(opts.outDir, 'messages.json');
const sessionsPath = path.join(opts.outDir, 'sessions.json');

async function appendJsonl(file, row) {
  await fs.appendFile(file, `${JSON.stringify(row, null, 0)}\n`, 'utf8');
}

async function api(method, pathname, body) {
  const res = await fetch(`${opts.backendUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : {};
}

async function configureProvider() {
  if (!opts.configureProvider) return;
  await api('PUT', '/v1/providers/lm', {
    provider: opts.provider,
    api_base: opts.apiBase,
    model: opts.model,
    transport: opts.transport,
    max_tokens: 32000,
  });
}

async function sessionWorkspaceId() {
  const body = await api('GET', '/v1/workspaces');
  return body.workspaces?.[0]?.id || undefined;
}

function parseSseFrames(buffer) {
  const frames = [];
  let rest = buffer;
  for (;;) {
    const split = rest.indexOf('\n\n');
    if (split < 0) break;
    frames.push(rest.slice(0, split));
    rest = rest.slice(split + 2);
  }
  return { frames, rest };
}

function decodeSseFrame(frame) {
  const out = { event: 'message', id: '', data: '' };
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) out.event = line.slice(6).trimStart();
    else if (line.startsWith('id:')) out.id = line.slice(3).trimStart();
    else if (line.startsWith('data:')) out.data += line.slice(5).trimStart();
  }
  return out;
}

async function readJsonlIfExists(file) {
  if (!file) return [];
  try {
    const text = await fs.readFile(file, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function msBetween(leftIso, rightIso) {
  const left = Date.parse(leftIso || '');
  const right = Date.parse(rightIso || '');
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : null;
}

function summarize(received, backendWrites, backendAudit) {
  const byWriteId = new Map(backendWrites.map((row) => [String(row.event_id), row]));
  const auditWrites = backendAudit.filter((row) => row.stage === 'sse.write');
  for (const row of auditWrites) {
    if (!byWriteId.has(String(row.event_id))) byWriteId.set(String(row.event_id), row);
  }

  const deltas = received.filter((row) =>
    ['turn.trace.delta', 'turn.text.delta', 'call.result.delta'].includes(row.event_type),
  );
  const normalized = received.filter((row) =>
    [
      'turn.started',
      'turn.trace.delta',
      'turn.text.delta',
      'turn.action.added',
      'call.result.delta',
      'state.updated',
      'turn.completed',
    ].includes(row.event_type),
  );
  const receiveLags = received
    .map((row) => msBetween(row.event_occurred_at, row.received_at))
    .filter((value) => value != null);
  const serverToClientLags = received
    .map((row) => {
      const write = byWriteId.get(String(row.event_id));
      return msBetween(write?.sse_written_at || write?.iso, row.received_at);
    })
    .filter((value) => value != null);
  const interarrival = [];
  for (let i = 1; i < deltas.length; i += 1) {
    const gap = msBetween(deltas[i - 1].received_at, deltas[i].received_at);
    if (gap != null) interarrival.push(gap);
  }
  const publicMarkerLeaks = received.filter((row) =>
    JSON.stringify(row.payload || {}).includes('[[ ##'),
  );
  return {
    session_id: received.find((row) => row.session_id)?.session_id || '',
    event_count: received.length,
    normalized_event_count: normalized.length,
    delta_event_count: deltas.length,
    event_types: Object.fromEntries(
      [...new Set(received.map((row) => row.event_type))].map((type) => [
        type,
        received.filter((row) => row.event_type === type).length,
      ]),
    ),
    max_occurred_to_received_ms: receiveLags.length ? Math.max(...receiveLags) : null,
    max_sse_write_to_received_ms: serverToClientLags.length ? Math.max(...serverToClientLags) : null,
    max_delta_interarrival_ms: interarrival.length ? Math.max(...interarrival) : null,
    public_marker_leak_count: publicMarkerLeaks.length,
    completed: received.some((row) => row.event_type === 'turn.completed'),
    has_trace_delta: received.some((row) => row.event_type === 'turn.trace.delta'),
    has_text_delta: received.some((row) => row.event_type === 'turn.text.delta'),
    has_tool_result_delta: received.some((row) => row.event_type === 'call.result.delta'),
  };
}

await fs.writeFile(receivedPath, '', 'utf8');
if (!opts.sessionId) await configureProvider();
const workspaceId = opts.sessionId ? undefined : await sessionWorkspaceId();
const session = opts.sessionId
  ? { id: opts.sessionId }
  : await api('POST', '/v1/sessions', {
      workspace_id: workspaceId,
      title: `EarthScope SSE probe ${new Date().toISOString()}`,
    });
const sid = session.id;
if (!opts.sessionId) {
  await api('POST', `/v1/sessions/${sid}/agent-blueprint`, { blueprint_id: opts.blueprint });
}

const controller = new AbortController();
const received = [];
let connectedResolve;
const connected = new Promise((resolve) => {
  connectedResolve = resolve;
});
let completedResolve;
const completed = new Promise((resolve) => {
  completedResolve = resolve;
});

const streamTask = (async () => {
  const res = await fetch(`${opts.backendUrl}/v1/sessions/${sid}/events`, {
    headers: {
      accept: 'text/event-stream',
      ...(opts.lastEventId ? { 'last-event-id': opts.lastEventId } : {}),
    },
    signal: controller.signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;
    for (const frame of parsed.frames) {
      const wire = decodeSseFrame(frame);
      const receivedAt = new Date().toISOString();
      let envelope = {};
      try {
        envelope = JSON.parse(wire.data || '{}');
      } catch {
        envelope = { parse_error: true, raw: wire.data };
      }
      const row = {
        received_at: receivedAt,
        event_id: wire.id,
        event_type: wire.event,
        event_occurred_at: envelope.occurred_at || '',
        replay: Boolean(envelope.replay),
        session_id: sid,
        payload: envelope.payload || {},
      };
      received.push(row);
      await appendJsonl(receivedPath, row);
      if (wire.event === 'server.connected') connectedResolve();
      if (wire.event === 'turn.completed' || wire.event === 'turn.failed') {
        completedResolve();
        return;
      }
    }
  }
})();

await Promise.race([
  connected,
  new Promise((_, reject) => setTimeout(() => reject(new Error('SSE did not connect')), 15_000)),
]);

if (opts.postPrompt) {
  await api('POST', `/v1/sessions/${sid}/messages`, {
    parts: [{ type: 'text', text: `${opts.prompt}\n\nSSE probe nonce: ${Date.now()}` }],
  });
}

let runError = null;
try {
  await Promise.race([
    completed,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`turn.completed not received within ${opts.maxWaitMs}ms`)),
        opts.maxWaitMs,
      ),
    ),
  ]);
} catch (error) {
  runError = error;
}

controller.abort();
await streamTask.catch((error) => {
  if (error.name !== 'AbortError') throw error;
});

const [backendWrites, backendAudit, messages, sessions] = await Promise.all([
  readJsonlIfExists(opts.backendSseEventLog),
  readJsonlIfExists(opts.backendAuditLog),
  api('GET', `/v1/sessions/${sid}/messages`),
  api('GET', '/v1/sessions?include_all_workspaces=true'),
]);
await fs.writeFile(messagesPath, `${JSON.stringify(messages, null, 2)}\n`, 'utf8');
await fs.writeFile(sessionsPath, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
const summary = summarize(received, backendWrites, backendAudit);
if (runError) summary.error = runError.message;
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ outDir: opts.outDir, ...summary }, null, 2));
if (runError) process.exit(1);
