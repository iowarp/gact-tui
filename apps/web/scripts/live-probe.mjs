/**
 * The live-probe driver for gact-tui#364 (in-flight tool rendering) / #362
 * (thinking dropout). Drives a REAL clio-agent through the REAL web app in
 * headless chromium and captures four synchronized streams of one turn into
 * a run directory, then hands them to `scripts/probe/verdict.mjs`'s pure
 * reducer for a per-tool_call-part-id verdict.
 *
 * Assumes serve + vite are ALREADY running (this script only drives the
 * browser + the target backend's REST API — it never boots either). The
 * backend's capture knobs (`CLIO_SSE_WIRE_TAP` / `CLIO_SSE_EVENT_LOG` /
 * `CLIO_STREAM_AUDIT_LOG`) must already be set when that server was
 * launched — this script reads whatever those env vars point at (passed
 * back in via `--wire-tap` / `--event-log` / `--stream-audit-log`, since a
 * Node script driving the browser has no access to the SERVER process's
 * environment).
 *
 * Usage:
 *   node live-probe.mjs --base http://127.0.0.1:17910 --app http://localhost:5174 \
 *     --scenario d1 --wire-tap <path> --event-log <path> --stream-audit-log <path> \
 *     [--run-tag d1-1] [--out-dir apps/web/screenshots/live-probe]
 *
 * The server is a long-lived process shared across every run this driver
 * makes, so the wire-tap/event-log/stream-audit files accumulate frames from
 * EVERY prior run too — this script snapshots each file's byte length
 * BEFORE the turn starts and only reads the newly-appended tail after the
 * turn settles, so one run's server-sse.jsonl never leaks another run's
 * frames.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { computeVerdict } from './probe/verdict.mjs';

// ---------------------------------------------------------------------------
// CLI args

function parseArgs(argv) {
  const args = { outDir: resolve(import.meta.dirname, '..', 'screenshots', 'live-probe') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    i++;
    switch (key) {
      case 'base':
        args.base = value;
        break;
      case 'app':
        args.app = value;
        break;
      case 'scenario':
        args.scenario = value;
        break;
      case 'wire-tap':
        args.wireTap = value;
        break;
      case 'event-log':
        args.eventLog = value;
        break;
      case 'stream-audit-log':
        args.streamAuditLog = value;
        break;
      case 'run-tag':
        args.runTag = value;
        break;
      case 'out-dir':
        args.outDir = resolve(value);
        break;
      case 'timeout-s':
        args.timeoutS = Number(value);
        break;
      default:
        console.warn(`[live-probe] unknown flag --${key}, ignoring`);
        i--;
    }
  }
  return args;
}

const SCENARIOS = {
  // d1 = spawn two children, then wait_agent_tasks + at least one re-poll —
  // exercises the collector-collapse path (transcript.py::
  // upsert_repeated_collector_call) at the heart of #364's H-B hypothesis.
  d1: {
    label: 'spawn two children, wait, re-poll',
    prompt:
      'Use your spawn_agents_parallel tool to launch exactly two child agents ' +
      'at the SAME time: one that computes 17 * 23 and replies with only the ' +
      'number, another that computes the 10th Fibonacci number (1-indexed, ' +
      '1,1,2,3,5,...) and replies with only the number. Then call ' +
      'wait_agent_tasks on both task ids with timeout_s=2 (a DELIBERATELY ' +
      'short timeout -- it almost certainly will NOT be enough for both ' +
      'children to finish, and that is intentional: you need to see it time ' +
      'out at least once). Every time wait_agent_tasks returns with any task ' +
      'still pending, call it again on exactly the still-pending ids with ' +
      'timeout_s=5, and repeat until both are done -- do not give up after ' +
      'one call. Once both are done, reply with both numeric answers on one ' +
      'line and nothing else.',
    // Generous: two child sessions + at least one poll round-trip.
    timeoutS: 360,
  },
  // d2 = long multi-step reasoning with a slow tool between steps —
  // exercises #362's thinking-dropout suspects (discard_open_text on retry
  // boundaries, dropped_empty_part, queue-full drop) across several
  // distinct thinking segments.
  d2: {
    label: 'long multi-step reasoning + slow tool',
    prompt:
      'Work through this in clearly separate reasoning steps, narrating your ' +
      'thinking before each one (do not skip straight to the answer): ' +
      '(1) list the first 8 prime numbers; ' +
      '(2) compute their sum; ' +
      '(3) use your shell tool to run a command that takes about 8 seconds ' +
      '(e.g. a short sleep/timeout) as a deliberately slow step, and wait for ' +
      'it to finish; ' +
      '(4) once it completes, compute the average of the 8 primes as a ' +
      'decimal; ' +
      '(5) state whether that average, rounded to the nearest integer, is ' +
      'itself a prime number, with your reasoning. ' +
      'Reply with a short final summary line at the end.',
    timeoutS: 420,
  },
};

// ---------------------------------------------------------------------------
// Backend REST setup (workspace + policy + session) — self-contained per run
// so d1/d2 runs never share transcript state.

async function jsonFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const text = await resp.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} -> ${resp.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

/**
 * d1's scenario (spawn two children + wait_agent_tasks + re-poll) needs an
 * agent with a DECLARED child — `spawn_agents_parallel`/`wait_agent_tasks`
 * only appear on the tool surface for an agent that declares at least one
 * child (`gact/agents/composition.py`: "any expert with declared children
 * IS, by construction, [given] spawn_agents_parallel"). The bare builtin
 * `main` agent (what a fresh session gets by default) declares none. Rather
 * than editing product code/config, this writes a minimal two-tier
 * blueprint into the RUN directory (pure per-run test data, exactly like
 * the workspace directory itself) and activates it on the session via
 * `POST /v1/sessions/{sid}/agent-blueprint {path: ...}` — an existing,
 * intended activation route, not a server change.
 */
async function writeD1Blueprint(runDir) {
  const root = join(runDir, 'blueprint');
  await mkdir(join(root, 'experts'), { recursive: true });
  await writeFile(
    join(root, 'AGENT.md'),
    [
      '---',
      'id: probe-orchestrator',
      'version: 0.1.0',
      'title: Probe Orchestrator (live-probe d1)',
      'description: Minimal two-tier blueprint so spawn_agents_parallel/wait_agent_tasks are on the tool surface for gact-tui#364 d1 evidence capture.',
      'root_expert: root',
      'blueprint:',
      '  format: agent-blueprint-v1',
      '---',
      '',
      'Two-tier probe blueprint: `root` declares one `worker` child so the',
      'spawn-runtime tools are available; `worker` does the actual computation.',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(root, 'experts', 'root.md'),
    [
      '---',
      'id: root',
      'title: Root',
      'tier: 1',
      'module:',
      '  kind: react',
      'tools: []',
      '---',
      '',
      'You are an orchestrator with exactly one declared child, `worker`, who',
      'can compute a single numeric task and reply with only the number. Use',
      'spawn_agents_parallel / wait_agent_tasks / check_agent_tasks exactly as',
      'instructed by the user turn.',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(root, 'experts', 'worker.md'),
    [
      '---',
      'id: worker',
      'title: Worker',
      'parent_id: root',
      'tier: 2',
      'module:',
      '  kind: react',
      'tools: []',
      '---',
      '',
      'You are a worker. Compute exactly the numeric task you are given and',
      'reply with ONLY the number, nothing else.',
      '',
    ].join('\n'),
  );
  return root;
}

async function setUpSession(base, { scenario, runTag, workspaceRoot, runDir }) {
  await mkdir(workspaceRoot, { recursive: true });
  const workspace = await jsonFetch(`${base}/v1/workspaces`, {
    method: 'POST',
    body: JSON.stringify({ root_path: workspaceRoot, name: `live-probe-${scenario}-${runTag}` }),
  });
  await jsonFetch(`${base}/v1/policies`, {
    method: 'PUT',
    body: JSON.stringify({ policies: [{ scope: 'workspace', scope_id: workspace.id, action: 'allow' }] }),
  });
  const title = `live-probe ${scenario} ${runTag}`;
  const session = await jsonFetch(`${base}/v1/sessions`, {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspace.id, title }),
  });
  if (scenario === 'd1') {
    const blueprintPath = await writeD1Blueprint(runDir);
    await jsonFetch(`${base}/v1/sessions/${session.id}/agent-blueprint`, {
      method: 'POST',
      body: JSON.stringify({ path: blueprintPath }),
    });
    console.log(`[live-probe] activated probe-orchestrator blueprint (declared child -> spawn tools) at ${blueprintPath}`);
  }
  return { workspace, session, title };
}

async function pollSessionSettled(base, sessionId, { timeoutMs, onTick }) {
  const start = Date.now();
  let sawRunning = false;
  while (Date.now() - start < timeoutMs) {
    const session = await jsonFetch(`${base}/v1/sessions/${sessionId}`);
    if (session.status === 'running' || session.status === 'waiting_permission') sawRunning = true;
    onTick?.(session);
    const settled = sawRunning && (session.status === 'idle' || session.status === 'error' || session.status === 'cancelled');
    if (settled) return session;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`session ${sessionId} did not settle within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// SSE wire-tap / event-log parsing (mirrors apps/core/src/client/sse.ts's
// WHATWG block-splitting rules for the raw tap, since that TS module can't
// be imported into this plain Node script without a build step).

function splitSseBlocks(text) {
  return text.split(/\r?\n\r?\n/).filter((block) => block.trim().length > 0);
}

function parseSseBlockRaw(block) {
  let id;
  let event;
  const dataLines = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { id, event, data: dataLines.join('\n') };
}

/** Extracts the join fields verdict.mjs's normalizeServerRow expects out of
 *  one parsed SSE envelope's JSON payload (see verdict.mjs's file-header
 *  doc comment for the exact server-sse.jsonl contract). */
function extractPartFields(envelope) {
  const payload = envelope && typeof envelope === 'object' ? envelope.payload : undefined;
  const part = payload && typeof payload === 'object' ? payload.part : undefined;
  if (!part || typeof part !== 'object') {
    return { message_id: payload?.message_id };
  }
  return {
    part_id: part.id,
    part_type: part.type,
    call_id: part.call_id,
    tool_name: part.tool_name,
    message_id: payload?.message_id,
  };
}

async function readNewTail(path, fromOffset) {
  try {
    const st = await stat(path);
    if (st.size <= fromOffset) return Buffer.alloc(0);
    const buf = await readFile(path);
    return buf.subarray(fromOffset);
  } catch (err) {
    if (err.code === 'ENOENT') return Buffer.alloc(0);
    throw err;
  }
}

async function offsetOf(path) {
  try {
    return (await stat(path)).size;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

/** Builds this run's server-sse.jsonl records from the wire-tap tail (full
 *  payload, gives part_id/call_id/tool_name) cross-referenced against the
 *  event-log tail (gives sse_written_at + replay) by event_id. PRE-dedup —
 *  verdict.mjs's dedupeServerFrames collapses the two-EventSource
 *  duplicate. */
async function buildServerSseRows({ wireTapPath, eventLogPath, wireTapOffset, eventLogOffset }) {
  const wireBuf = await readNewTail(wireTapPath, wireTapOffset);
  const eventBuf = await readNewTail(eventLogPath, eventLogOffset);

  // Join key: `event_id|occurred_at`, NOT event_id alone. Two things make
  // event_id alone unsafe: (1) `CLIO_SSE_EVENT_LOG` stores `event_id` as a
  // JSON NUMBER while the wire tap's SSE `id:` line is always TEXT — a bare
  // `Map.get(stringId)` against a number-keyed map silently misses every
  // row (found live: every join failed, session_id came back undefined for
  // 100% of rows); (2) `event_id` is a small PER-SESSION counter (0, 5, 6,
  // 7, ...), so two concurrently-active sessions — e.g. a d1 run's parent
  // plus its own freshly-spawned children — collide on the same small
  // integers in the SAME shared wire-tap file. `occurred_at` is a
  // microsecond-precision timestamp stamped from the same `Event.
  // occurred_at` into both the envelope payload and the log row, so pairing
  // on BOTH fields together is collision-safe in practice.
  const eventLogByKey = new Map();
  const logKeyOf = (eventId, occurredAt) => `${String(eventId)}|${occurredAt}`;
  for (const line of eventBuf.toString('utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    const key = logKeyOf(row.event_id, row.event_occurred_at);
    const list = eventLogByKey.get(key) ?? [];
    list.push(row);
    eventLogByKey.set(key, list);
  }

  const rows = [];
  for (const block of splitSseBlocks(wireBuf.toString('utf-8'))) {
    const parsed = parseSseBlockRaw(block);
    if (!parsed || !parsed.data) continue;
    let envelope;
    try {
      envelope = JSON.parse(parsed.data);
    } catch {
      continue; // non-JSON frame (comment/heartbeat) — not evidence of a part.
    }
    const logRows = eventLogByKey.get(logKeyOf(parsed.id, envelope.occurred_at)) ?? [];
    // The wire tap and event log are written in the SAME call per frame per
    // connection (runtime/stream_audit.py-adjacent misc.py::_write_wire_tap),
    // so consume one matching, not-yet-used log row per parsed frame when
    // more than one connection logged this event_id.
    const logRow = logRows.shift();
    rows.push({
      event_id: parsed.id,
      event_type: envelope.type ?? parsed.event,
      occurred_at: envelope.occurred_at,
      sse_written_at: logRow?.sse_written_at ?? envelope.occurred_at,
      replay: logRow?.replay ?? false,
      // The wire tap is a server-WIDE file (every connection, every
      // session); the event log's own row carries `session_id`, which is
      // how the caller scopes this run's rows down to the ONE session it
      // actually drove — without this, a d1 run's server-sse.jsonl would
      // also carry its two spawned children's OWN session event streams,
      // which the viewed session's EventSource never subscribes to and so
      // would wrongly show up as "transport-lost" (#364 evidence hygiene).
      session_id: logRow?.session_id,
      ...extractPartFields(envelope),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Browser instrumentation

async function installEventSourceCapture(page) {
  await page.addInitScript(() => {
    window.__probeSse = [];
    const Native = window.EventSource;
    const origAdd = Native.prototype.addEventListener;
    Native.prototype.addEventListener = function (type, listener, opts) {
      const wrapped = (ev) => {
        let parsed;
        try {
          parsed = JSON.parse(ev.data ?? '');
        } catch {
          parsed = undefined;
        }
        const payload = parsed && typeof parsed === 'object' ? parsed.payload : undefined;
        const part = payload && typeof payload === 'object' ? payload.part : undefined;
        window.__probeSse.push({
          recv_at: new Date().toISOString(),
          type,
          lastEventId: ev.lastEventId,
          part_id: part && typeof part === 'object' ? part.id : undefined,
          part_type: part && typeof part === 'object' ? part.type : undefined,
          call_id: part && typeof part === 'object' ? part.call_id : undefined,
          tool_name: part && typeof part === 'object' ? part.tool_name : undefined,
          message_id: payload && typeof payload === 'object' ? payload.message_id : undefined,
        });
        return listener.call(this, ev);
      };
      return origAdd.call(this, type, wrapped, opts);
    };
  });
}

async function registerBackend(page, base) {
  await page.addInitScript(
    ([backendUrl]) => {
      try {
        localStorage.setItem(
          'clio.backends.v3',
          JSON.stringify({
            backends: [{ id: backendUrl, label: 'live-probe', url: backendUrl, bearerToken: '', kind: 'http' }],
            currentId: backendUrl,
          }),
        );
        localStorage.setItem('clio.backend.last-url.v3', backendUrl);
      } catch {
        // Storage unavailable; the connect screen's manual flow still works.
      }
    },
    [base],
  );
}

/** MutationObserver over document.body — see verdict.mjs's file-header doc
 *  comment for the dom-timeline.jsonl contract. Selectors are read off the
 *  REAL markup (apps/web/src/kit/PartCard.tsx: `.kit-partcard[data-kind]`;
 *  apps/web/src/transcript/parts/ToolPart.tsx: `[data-testid="part-tool"]`
 *  + `.part-toolrow__pending` ("running…") + `data-call-id` (gact-tui#364
 *  client-half fix — the tool row's own wire call_id, read here so
 *  verdict.mjs's `matchDomRowsToCalls` can join by exact id instead of its
 *  original text/positional heuristic); apps/web/src/transcript/
 *  registry.tsx: `.part-collapsible` + `.part-thinkinghead` for thinking) —
 *  never guessed. */
async function installDomObserver(page) {
  await page.evaluate(() => {
    window.__probeDom = [];
    const SELECTOR = '.kit-partcard[data-kind], [data-testid^="part-"]';
    const push = (op, el) => {
      const kindEl = el.matches?.('.kit-partcard[data-kind]') ? el : el.closest?.('.kit-partcard[data-kind]');
      const testidEl = el.matches?.('[data-testid^="part-"]') ? el : el.closest?.('[data-testid^="part-"]');
      window.__probeDom.push({
        t: new Date().toISOString(),
        op,
        testid: testidEl?.getAttribute('data-testid') ?? undefined,
        kind: kindEl?.getAttribute('data-kind') ?? undefined,
        pending: !!el.querySelector?.('.part-toolrow__pending'),
        textHead: (el.textContent ?? '').trim().slice(0, 120),
        callId: testidEl?.getAttribute('data-call-id') ?? undefined,
      });
    };
    // React frequently batches a WHOLE message's parts into ONE childList
    // mutation (the added node is `<article class="transcript__message">`,
    // not a partcard itself) — an ancestor-only `closest()` check on the
    // added node misses every nested part in that case (found live: a d2
    // run showed 3 distinct thinking parts server-side + client-side but
    // only 2 `add` mutations recorded before this fix). Record the added
    // node itself when it matches, AND walk its subtree for every nested
    // partcard/testid element so a batched insert is never under-counted.
    const handleAdded = (node) => {
      if (node.nodeType !== 1) return;
      if (node.matches?.(SELECTOR)) push('add', node);
      const nested = node.querySelectorAll?.(SELECTOR) ?? [];
      for (const el of nested) push('add', el);
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) handleAdded(node);
        } else if (m.type === 'attributes' && m.target.nodeType === 1) {
          push('attr', m.target);
        } else if (m.type === 'characterData' && m.target.parentElement) {
          push('text', m.target.parentElement);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-kind', 'data-testid', 'data-error'],
      characterData: true,
    });
    window.__probeDomObserver = observer;
  });
}

// ---------------------------------------------------------------------------
// Main driver

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base || !args.app || !args.scenario) {
    console.error('usage: node live-probe.mjs --base <url> --app <url> --scenario d1|d2 [--wire-tap <path> --event-log <path> --stream-audit-log <path>] [--run-tag tag]');
    process.exit(2);
  }
  const scenario = SCENARIOS[args.scenario];
  if (!scenario) {
    console.error(`unknown scenario ${args.scenario}; choices: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
  }
  const runTag = args.runTag ?? `${args.scenario}-${Date.now()}`;
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(args.outDir, iso, `${args.scenario}-${runTag}`);
  await mkdir(runDir, { recursive: true });
  console.log(`[live-probe] run dir: ${runDir}`);

  const workspaceRoot = join(runDir, 'workspace');
  const { workspace, session, title } = await setUpSession(args.base, {
    scenario: args.scenario,
    runTag,
    workspaceRoot,
    runDir,
  });
  console.log(`[live-probe] workspace ${workspace.id}, session ${session.id} ("${title}")`);

  const wireTapOffset = args.wireTap ? await offsetOf(args.wireTap) : 0;
  const eventLogOffset = args.eventLog ? await offsetOf(args.eventLog) : 0;
  const streamAuditOffset = args.streamAuditLog ? await offsetOf(args.streamAuditLog) : 0;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const network = [];
  page.on('request', (r) => network.push({ t: new Date().toISOString(), dir: 'request', method: r.method(), url: r.url() }));
  page.on('response', (r) => network.push({ t: new Date().toISOString(), dir: 'response', status: r.status(), url: r.url() }));
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await installEventSourceCapture(page);
  await registerBackend(page, args.base);
  await page.goto(args.app, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: /workspaces/i }).waitFor({ timeout: 30000 });
  await installDomObserver(page);

  await page.getByRole('button', { name: title, exact: true }).click();
  await page.waitForTimeout(500);

  const ta = page.getByRole('textbox');
  await ta.click();
  await ta.fill(scenario.prompt);
  await ta.press('Enter');
  console.log(`[live-probe] prompt submitted (${scenario.label})`);

  const screenshotsDir = join(runDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });
  let shot = 0;
  const shotTimer = setInterval(async () => {
    shot += 1;
    await page.screenshot({ path: join(screenshotsDir, `t${String(shot).padStart(3, '0')}.png`) }).catch(() => {});
  }, 5000);

  const timeoutS = args.timeoutS ?? scenario.timeoutS;
  let settledSession;
  try {
    settledSession = await pollSessionSettled(args.base, session.id, {
      timeoutMs: timeoutS * 1000,
      onTick: (s) => console.log(`[live-probe] session status: ${s.status}`),
    });
  } catch (err) {
    console.error(`[live-probe] ${err.message}`);
  } finally {
    clearInterval(shotTimer);
  }
  await page.waitForTimeout(1500); // let the last SSE frames' DOM effects settle
  await page.screenshot({ path: join(screenshotsDir, 'settle.png'), fullPage: true });

  const domRows = await page.evaluate(() => window.__probeDom ?? []);
  const clientRows = await page.evaluate(() => window.__probeSse ?? []);
  await browser.close();

  await writeFile(join(runDir, 'client-sse.jsonl'), clientRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await writeFile(join(runDir, 'dom-timeline.jsonl'), domRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await writeFile(join(runDir, 'network.jsonl'), network.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // NOT filtered down to this run's session_id, deliberately: the wire tap
  // is server-wide, but SO IS the client's own capture — SessionView opens
  // an EventSource per live child preview too (verified live: a d1 run's
  // "unexplained_client_events" was full of real message.part.* frames for
  // the two spawned children's OWN session_ids, which a session-id filter
  // on the SERVER side had silently dropped, manufacturing a FALSE
  // "unexplained" verdict for perfectly-explained child-preview delivery).
  // `calls` grouping is unaffected either way — `part_id`/`call_id` embed a
  // random hex call id, so cross-session collision is not a real risk.
  // Every row still carries `session_id` + `event_type` for a reader to
  // filter by hand; treat a bare "absent"/"unexplained" count as an upper
  // bound, not proof, until you have checked those two fields.
  let serverRows = [];
  if (args.wireTap && args.eventLog) {
    serverRows = await buildServerSseRows({
      wireTapPath: args.wireTap,
      eventLogPath: args.eventLog,
      wireTapOffset,
      eventLogOffset,
    });
    const bySession = new Map();
    for (const r of serverRows) bySession.set(r.session_id, (bySession.get(r.session_id) ?? 0) + 1);
    console.log(`[live-probe] server-sse session breakdown (this run's session is ${session.id}):`, Object.fromEntries(bySession));
  } else {
    console.warn('[live-probe] --wire-tap / --event-log not supplied; server-sse.jsonl will be empty');
  }
  await writeFile(join(runDir, 'server-sse.jsonl'), serverRows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  let auditRows = [];
  if (args.streamAuditLog) {
    const tail = await readNewTail(args.streamAuditLog, streamAuditOffset);
    auditRows = tail
      .toString('utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }
  await writeFile(join(runDir, 'stream-audit.jsonl'), auditRows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const verdict = computeVerdict({ serverRows, clientRows, domRows, auditRows });
  await writeFile(join(runDir, 'verdict.json'), JSON.stringify(verdict, null, 2));

  const summary = {
    run_dir: runDir,
    scenario: args.scenario,
    session_id: session.id,
    workspace_id: workspace.id,
    session_status: settledSession?.status ?? 'unsettled',
    console_errors: consoleErrors,
    calls: verdict.calls.map((c) => ({ tool_name: c.tool_name, part_id: c.part_id, verdict: c.verdict, attempts: c.attempts })),
    server_ids_absent_client_side: verdict.server_ids_absent_client_side,
    unexplained_client_events: verdict.unexplained_client_events.length,
    counts: verdict.counts,
  };
  await writeFile(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`[live-probe] wrote ${join(runDir, 'verdict.json')}`);
  console.log(`[live-probe] ${verdict.calls.length} call(s):`);
  for (const call of verdict.calls) {
    console.log(`  ${call.tool_name ?? '?'} (${call.part_id}) attempts=${call.attempts} -> ${call.verdict}`);
  }
  if (consoleErrors.length > 0) {
    console.log(`[live-probe] ${consoleErrors.length} console error(s):`);
    for (const e of consoleErrors.slice(0, 5)) console.log(`  ! ${e.split('\n')[0]}`);
  }
  console.log(`[live-probe] done: ${runDir}`);
}

await main();
