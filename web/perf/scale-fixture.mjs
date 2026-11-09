// Scale overlay for the browser fixture.
//
// Sits in front of `e2e/fixture-server.mjs` and adds the large-data scenarios
// the performance harness needs: many workspaces and conversations, one very
// long conversation with tool calls, a large file tree and large files. Every
// other request is forwarded unchanged. Synthetic conversation and workspace
// ids are rewritten to the fixture's own ids for routes the overlay does not
// own, so their side panels still have something to read.
//
// Unlike the base fixture, the overlay honours the real service's paging
// contracts (messages `limit`/`before`, sessions `limit`/`cursor`, file
// `directory`/`offset`), so a page that reads a whole conversation shows up in
// the request log as an unbounded read instead of being hidden by the fixture.
//
//   CLIO_FIXTURE_PORT=18811 CLIO_PERF_PROXY_PORT=18812 node perf/scale-fixture.mjs
//
// Control endpoints (local only):
//   POST /__perf/scenario  {"sessions":2000,"workspaces":50,"messages":5000,...}
//   GET  /__perf/requests  the request log since the last read (and clears it)
import { createServer, request as httpRequest } from 'node:http';
import { crc32 as zlibCrc32, deflateSync } from 'node:zlib';

const upstreamPort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18811', 10);
const port = Number.parseInt(process.env['CLIO_PERF_PROXY_PORT'] ?? '18812', 10);
for (const value of [upstreamPort, port]) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) throw new Error('Invalid port');
}

const BASE_WORKSPACE = 'ws_flat_ndp';
const BASE_SESSION = 'sess_flat_ndp';
const HUGE_SESSION = 'sess_perf_huge';
const EPOCH = Date.parse('2026-08-20T08:00:00.000Z');

const defaults = {
  /** Synthetic conversations, spread across the base and synthetic workspaces. */
  sessions: 0,
  /** Synthetic workspaces in addition to flat-NDP. */
  workspaces: 0,
  /** Messages in the long conversation (0 hides it). */
  messages: 0,
  /** Tool calls per assistant message in the long conversation. */
  toolsPerMessage: 2,
  /** Files added under perf/ in flat-NDP (0 disables the large tree). */
  files: 0,
  /** Size of perf/large-table.csv and perf/large-log.txt (bytes; 0 disables). */
  largeFileBytes: 0,
  /** Server-side cap of an unscoped file walk, as the service applies. */
  fileWalkCap: 5000,
};
let scenario = { ...defaults };
let log = [];

const cors = {
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Last-Event-ID, Range, Upload-Offset, X-A2UI-Version, X-GACT-Version',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'X-GACT-Version': '0.3',
};

function sendJson(response, body, status = 200) {
  const text = JSON.stringify(body);
  response.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  response.end(text);
  return Buffer.byteLength(text);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const iso = (offsetSeconds) => new Date(EPOCH + offsetSeconds * 1000).toISOString();
const pad = (value, width = 5) => String(value).padStart(width, '0');

// --- Workspaces and conversations -------------------------------------------

function syntheticWorkspaces() {
  return Array.from({ length: scenario.workspaces }, (_, index) => ({
    id: `ws_perf_${pad(index, 3)}`,
    name: `perf-workspace-${pad(index, 3)}`,
    display_name: `Perf workspace ${pad(index, 3)}`,
    path: `D:\\science\\perf\\workspace-${pad(index, 3)}`,
    connection_id: 'fixture',
  }));
}

function workspaceFor(index) {
  const slot = index % (scenario.workspaces + 1);
  return slot === 0 ? BASE_WORKSPACE : `ws_perf_${pad(slot - 1, 3)}`;
}

const STATES = ['completed', 'completed', 'completed', 'idle', 'failed', 'cancelled'];
const TOPICS = [
  'EarthScope station coverage',
  'GNSS displacement trend review',
  'Seismic catalog reconciliation',
  'HDF5 archive inventory',
  'Model sweep on Polaris',
  'Sea-level anomaly maps',
  'Instrument calibration notes',
  'Provenance audit of derived series',
];

function syntheticSessions() {
  const rows = Array.from({ length: scenario.sessions }, (_, index) => ({
    id: `sess_perf_${pad(index)}`,
    workspace_id: workspaceFor(index),
    title: `Perf conversation ${pad(index)}: ${TOPICS[index % TOPICS.length]}`,
    state: STATES[index % STATES.length],
    created_at: iso(index * 60),
    updated_at: iso(index * 60 + 30),
    provider_id: 'codex',
    model_id: 'gpt-5.6-luna',
    effort: 'medium',
    agent_id: 'main',
  }));
  if (scenario.messages > 0) {
    rows.push({
      id: HUGE_SESSION,
      workspace_id: BASE_WORKSPACE,
      title: `Long campaign transcript (${scenario.messages.toLocaleString('en-US')} messages)`,
      state: 'completed',
      created_at: iso(0),
      // Newest, so it leads the sidebar and is easy to open.
      updated_at: '2026-08-22T20:00:30.000Z',
      provider_id: 'codex',
      model_id: 'gpt-5.6-luna',
      effort: 'medium',
      agent_id: 'main',
    });
  }
  return rows;
}

// --- The long conversation ---------------------------------------------------

const TOOL_KINDS = [
  {
    name: 'fs_read_file',
    action: 'Read',
    subject: 'file',
    target: (i) => `results/run-${pad(i)}/summary.md`,
  },
  {
    name: 'shell_bash',
    action: 'Run',
    subject: 'command',
    target: (i) => `python analyze.py --run ${i}`,
  },
  {
    name: 'ndp_search_datasets',
    action: 'Search',
    subject: 'query',
    target: (i) => `earthscope station ${i % 97}`,
  },
  {
    name: 'fs_write_file',
    action: 'Write',
    subject: 'file',
    target: (i) => `notes/finding-${pad(i)}.md`,
  },
];

function messageText(index) {
  const n = index + 1;
  if (index % 2 === 0) {
    return `Request ${n}: compare station ${n % 211} against the reference network and keep provenance visible.`;
  }
  const code =
    index % 10 === 1
      ? `\n\n\`\`\`python\nimport numpy as np\nseries = np.loadtxt("station-${n % 211}.csv", delimiter=",")\nprint(series.mean(axis=0), series.std(axis=0))\n\`\`\`\n`
      : '';
  return (
    `Finding ${n}. Station ${n % 211} shows a **${(n % 17) / 10} mm/yr** vertical trend with ` +
    `${n % 5} gaps in the record. The derived series matches the archived reference within ` +
    `tolerance; the quality flags were carried through unchanged.${code}\n\n` +
    `- Coverage: ${90 + (n % 10)}%\n- Gaps: ${n % 5}\n- Source: EarthScope GNSS v${1 + (n % 3)}`
  );
}

function toolsFor(index, sessionId = HUGE_SESSION) {
  if (index % 2 === 0) return [];
  return Array.from({ length: scenario.toolsPerMessage }, (_, slot) => {
    const kind = TOOL_KINDS[(index + slot) % TOOL_KINDS.length];
    const failed = (index + slot) % 23 === 0;
    const target = kind.target(index);
    return {
      id: `tool_perf_${pad(index)}_${slot}`,
      session_id: sessionId,
      run_id: `run_perf_${pad(Math.floor(index / 2))}`,
      name: kind.name,
      title: kind.action,
      state: failed ? 'failed' : 'succeeded',
      duration_ms: 120 + ((index * 37 + slot * 11) % 4000),
      input: kind.subject === 'command' ? { command: target } : { path: target, query: target },
      output: failed
        ? `Error: fixture failure ${index}`
        : Array.from(
            { length: 24 },
            (_, line) => `line ${line + 1}: value ${(index * 31 + line) % 997}`,
          ).join('\n'),
      ...(failed ? { error: `Fixture failure ${index}` } : {}),
      presentation: {
        action: kind.action,
        summary: failed ? 'exit 1' : `${24 + (index % 40)} lines`,
        subject: kind.subject,
        blocks: [{ id: 'target', type: 'text', text: target, label: target }],
      },
    };
  });
}

function hugeMessage(index, sessionId = HUGE_SESSION) {
  const tools = toolsFor(index, sessionId);
  const role = index % 2 === 0 ? 'user' : 'assistant';
  return {
    message: {
      id: `msg_perf_${pad(index, 6)}`,
      session_id: sessionId,
      run_id: `run_perf_${pad(Math.floor(index / 2))}`,
      role,
      created_at: iso(index * 20),
      completed_at: iso(index * 20 + 15),
      ...(role === 'assistant'
        ? {
            stop_reason: 'end_turn',
            model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
            usage: { input: 18_400 + index * 40, output: 212, cache_read: 0, cache_write: 0 },
          }
        : {}),
      blocks: [
        ...tools.map((tool, slot) => ({
          id: `part_${pad(index, 6)}_${slot}`,
          type: 'tool',
          tool_id: tool.id,
        })),
        {
          id: `block_perf_${pad(index, 6)}`,
          type: 'text',
          ...(role === 'assistant' ? { channel: 'answer' } : {}),
          text: messageText(index),
        },
      ],
    },
    tools,
  };
}

/** The real service's paging: the newest `limit` messages older than `before`. */
function hugeTranscript(url) {
  const total = scenario.messages;
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const before = url.searchParams.get('before');
  let end = total;
  if (before) {
    const match = /^msg_perf_(\d+)$/u.exec(before);
    end = match ? Math.min(total, Number.parseInt(match[1], 10)) : total;
  }
  const bounded = Number.isFinite(limit) && limit > 0;
  const start = bounded ? Math.max(0, end - limit) : 0;
  const messages = [];
  const tools = [];
  for (let index = start; index < end; index += 1) {
    const row = hugeMessage(index);
    messages.push(row.message);
    tools.push(...row.tools);
  }
  return {
    body: {
      messages,
      tools,
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
      next_cursor: start > 0 ? (messages[0]?.id ?? null) : null,
    },
    unbounded: !bounded,
    returned: messages.length,
  };
}

/** Apply the same paging to the base fixture, which always returns everything. */
function pageTranscript(full, url) {
  const all = full.messages ?? [];
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const before = url.searchParams.get('before');
  const bounded = Number.isFinite(limit) && limit > 0;
  let end = all.length;
  if (before) {
    const index = all.findIndex((message) => message.id === before);
    if (index >= 0) end = index;
  }
  const start = bounded ? Math.max(0, end - limit) : 0;
  const messages = all.slice(start, end);
  const referenced = new Set(
    messages.flatMap((message) =>
      (message.blocks ?? []).map((block) => block.tool_id).filter(Boolean),
    ),
  );
  const tools = bounded
    ? (full.tools ?? []).filter((tool) => referenced.has(tool.id))
    : (full.tools ?? []);
  return {
    body: { ...full, messages, tools, next_cursor: start > 0 ? (messages[0]?.id ?? null) : null },
    unbounded: !bounded,
    returned: messages.length,
  };
}

// --- Files ----------------------------------------------------------------

function largeTree() {
  const entries = [];
  if (scenario.files > 0) {
    entries.push({ path: 'perf', type: 'dir' });
    const perDirectory = 250;
    const directories = Math.ceil(scenario.files / perDirectory);
    for (let d = 0; d < directories; d += 1) {
      const directory = `perf/batch-${pad(d, 3)}`;
      entries.push({ path: directory, type: 'dir' });
      for (let f = 0; f < perDirectory && d * perDirectory + f < scenario.files; f += 1) {
        const n = d * perDirectory + f;
        entries.push({
          path: `${directory}/sample-${pad(n)}.csv`,
          type: 'file',
          size: 4096 + (n % 4096),
        });
      }
    }
  }
  if (scenario.largeFileBytes > 0) {
    if (!entries.length) entries.push({ path: 'perf', type: 'dir' });
    entries.push({ path: 'perf/large-table.csv', type: 'file', size: scenario.largeFileBytes });
    entries.push({ path: 'perf/large-log.txt', type: 'file', size: scenario.largeFileBytes });
  }
  return entries;
}

function largeFile(path) {
  const bytes = scenario.largeFileBytes;
  if (!bytes) return undefined;
  const lines = [];
  let size = 0;
  if (path === 'perf/large-table.csv') {
    lines.push('station,time,east_mm,north_mm,up_mm,quality');
    for (let row = 0; size < bytes; row += 1) {
      const line = `P${pad(row % 997, 3)},${iso(row * 30)},${((row * 7) % 1000) / 100},${((row * 13) % 1000) / 100},${((row * 17) % 1000) / 100},${row % 3 === 0 ? 'good' : 'fair'}`;
      lines.push(line);
      size += line.length + 1;
    }
    return { type: 'text/csv', body: lines.join('\n') };
  }
  if (path === 'perf/large-log.txt') {
    for (let row = 0; size < bytes; row += 1) {
      const line = `${iso(row)} INFO worker-${row % 16} processed chunk ${row} of campaign run in ${(row * 37) % 900} ms`;
      lines.push(line);
      size += line.length + 1;
    }
    return { type: 'text/plain', body: lines.join('\n') };
  }
  return undefined;
}

let cachedLargeFiles = new Map();

/** One `bytes=a-b`, `bytes=a-` or `bytes=-n` range; anything else reads the whole file. */
function byteRange(header, length) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return undefined;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, length - suffix), end: length - 1 };
  }
  const start = Number(match[1]);
  if (start >= length) return 'unsatisfiable';
  const end = match[2] === '' ? length - 1 : Math.min(Number(match[2]), length - 1);
  return end < start ? undefined : { start, end };
}

/** Deterministic bytes for the base fixture's listed files (it serves none). */
function seededFile(path) {
  if (path === 'results/stations.csv') {
    const lines = ['station,latitude,longitude,coverage_pct,uplift_mm_yr,status'];
    for (let row = 0; row < 36; row += 1) {
      lines.push(
        `P${pad(100 + row * 7, 3)},${(34 + (row % 9) * 0.71).toFixed(3)},${(-121 + (row % 11) * 0.53).toFixed(3)},` +
          `${(72 + ((row * 37) % 28)).toFixed(1)},${(((row * 13) % 40) / 10 - 1.5).toFixed(2)},${row % 5 === 0 ? 'review' : 'ok'}`,
      );
    }
    return { type: 'text/csv', body: lines.join('\n') };
  }
  if (path === 'results/vertical-displacement.png')
    return { type: 'image/png', body: displacementPng(640, 360) };
  if (path === SEEDED_SOURCE_PATH) return { type: 'text/x-python', body: SEEDED_SOURCE };
  return undefined;
}

/** A source file and its recorded change, so screens can show source and diff tabs. */
const SEEDED_SOURCE_PATH = 'scripts/regrid_stations.py';
const SEEDED_SOURCE = `"""Regrid GNSS station uplift onto the study grid."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

GRID_STEP_DEG = 0.25
REVIEW_COVERAGE_PCT = 80.0


@dataclass(frozen=True)
class Station:
    name: str
    latitude: float
    longitude: float
    coverage_pct: float
    uplift_mm_yr: float


def read_stations(path: Path) -> list[Station]:
    with path.open(newline="") as handle:
        return [
            Station(
                row["station"],
                float(row["latitude"]),
                float(row["longitude"]),
                float(row["coverage_pct"]),
                float(row["uplift_mm_yr"]),
            )
            for row in csv.DictReader(handle)
        ]


def regrid(stations: list[Station], step: float = GRID_STEP_DEG) -> np.ndarray:
    lats = np.arange(34.0, 40.5, step)
    lons = np.arange(-121.0, -115.0, step)
    grid = np.full((lats.size, lons.size), np.nan)
    for station in stations:
        if station.coverage_pct < REVIEW_COVERAGE_PCT:
            continue
        i = int((station.latitude - lats[0]) / step)
        j = int((station.longitude - lons[0]) / step)
        grid[i, j] = station.uplift_mm_yr
    return grid


if __name__ == "__main__":
    stations = read_stations(Path("results/stations.csv"))
    grid = regrid(stations)
    print(f"{np.count_nonzero(~np.isnan(grid))} cells from {len(stations)} stations")
`;
const SEEDED_DIFF = {
  id: 'diff_regrid_threshold',
  path: SEEDED_SOURCE_PATH,
  status: 'applied',
  created: false,
  unified_diff: [
    `--- a/${SEEDED_SOURCE_PATH}`,
    `+++ b/${SEEDED_SOURCE_PATH}`,
    '@@ -9,7 +9,7 @@ from pathlib import Path',
    ' import numpy as np',
    ' ',
    ' GRID_STEP_DEG = 0.25',
    '-REVIEW_COVERAGE_PCT = 70.0',
    '+REVIEW_COVERAGE_PCT = 80.0',
    ' ',
    ' ',
    ' @dataclass(frozen=True)',
    '@@ -43,6 +43,7 @@ def regrid(stations: list[Station], step: float = GRID_STEP_DEG) -> np.ndarray:',
    '     for station in stations:',
    '         if station.coverage_pct < REVIEW_COVERAGE_PCT:',
    '             continue',
    '+        # Stations below the review threshold stay out of the grid.',
    '         i = int((station.latitude - lats[0]) / step)',
    '         j = int((station.longitude - lons[0]) / step)',
    '         grid[i, j] = station.uplift_mm_yr',
    '',
  ].join('\n'),
  lines_added: 2,
  lines_removed: 1,
  undo_available: true,
  tool_name: 'fs_edit_file',
  recorded_at: '2026-08-22T00:00:00Z',
};

/** A smooth displacement-like field as an RGB PNG. */
function displacementPng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 3 + 1);
    raw[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const value = (Math.sin(x / 47) * Math.cos(y / 31) + Math.sin((x + y) / 83)) / 2;
      const t = (value + 1) / 2;
      const index = offset + 1 + x * 3;
      raw[index] = Math.round(40 + 200 * t);
      raw[index + 1] = Math.round(90 + 80 * (1 - Math.abs(t - 0.5) * 2));
      raw[index + 2] = Math.round(220 - 180 * t);
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlibCrc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Proxy ------------------------------------------------------------------

const syntheticSession = /^\/v1\/sessions\/(sess_perf_[^/]+)(\/.*)?$/u;
const syntheticWorkspace = /^\/v1\/workspaces\/(ws_perf_[^/]+)(\/.*)?$/u;

function forward(request, response, url, body, entry, rewrite) {
  return new Promise((resolve) => {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: upstreamPort,
        method: request.method,
        path: rewrite ?? `${url.pathname}${url.search}`,
        headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` },
      },
      (upstreamResponse) => {
        entry.status = upstreamResponse.statusCode ?? 0;
        response.writeHead(entry.status, upstreamResponse.headers);
        upstreamResponse.on('data', (chunk) => {
          entry.bytes += chunk.length;
        });
        upstreamResponse.pipe(response);
        upstreamResponse.on('end', resolve);
        upstreamResponse.on('error', resolve);
      },
    );
    upstream.on('error', (error) => {
      entry.status = 502;
      if (!response.headersSent) sendJson(response, { error: String(error) }, 502);
      else response.end();
      resolve();
    });
    response.on('close', () => {
      upstream.destroy();
      resolve();
    });
    upstream.end(body);
  });
}

function upstreamJson(path) {
  return new Promise((resolve, reject) => {
    httpRequest({ host: '127.0.0.1', port: upstreamPort, path, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    })
      .on('error', reject)
      .end();
  });
}

async function handleSessions(url, response) {
  const upstreamUrl = new URL(url);
  upstreamUrl.searchParams.delete('limit');
  upstreamUrl.searchParams.delete('cursor');
  const base = await upstreamJson(`${upstreamUrl.pathname}${upstreamUrl.search}`);
  const named = url.searchParams.get('ids')?.split(',');
  const workspace = url.searchParams.get('workspace_id');
  const search = url.searchParams.get('q')?.toLowerCase();
  const archived = url.searchParams.get('archived') === 'true';
  const kinds = url.searchParams.get('kinds')?.split(',');
  const waiting = url.searchParams.get('waiting_on_person') === 'true';
  const family = url.searchParams.get('family_of');
  const synthetic =
    waiting || archived || (family && !family.startsWith('sess_perf_'))
      ? []
      : syntheticSessions().filter(
          (row) =>
            (!named || named.includes(row.id)) &&
            (!family || row.id === family) &&
            (!workspace || row.workspace_id === workspace) &&
            (!kinds || kinds.includes('conversation')) &&
            (!search || row.title.toLowerCase().includes(search)),
        );
  const rows = [...(base.sessions ?? []), ...synthetic].sort((a, b) =>
    String(b.updated_at).localeCompare(String(a.updated_at)),
  );
  const limit = Number(url.searchParams.get('limit') || rows.length || 1);
  const offset = Number(url.searchParams.get('cursor') || 0);
  return sendJson(response, {
    sessions: rows.slice(offset, offset + limit),
    total: rows.length,
    next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
  });
}

async function handleFiles(url, response, workspaceId) {
  const base = await upstreamJson(`/v1/workspaces/${BASE_WORKSPACE}/files`);
  const seeded =
    workspaceId === BASE_WORKSPACE
      ? [
          { path: 'scripts', type: 'dir' },
          { path: SEEDED_SOURCE_PATH, type: 'file', size: Buffer.byteLength(SEEDED_SOURCE) },
        ]
      : [];
  const all = [
    ...(workspaceId === BASE_WORKSPACE ? (base.entries ?? []) : []),
    ...seeded,
    ...largeTree(),
  ];
  const directory = url.searchParams.get('directory');
  if (directory === null) {
    return sendJson(response, {
      entries: all.slice(0, scenario.fileWalkCap),
      truncated: all.length > scenario.fileWalkCap,
    });
  }
  const prefix = directory ? `${directory.replace(/\/$/u, '')}/` : '';
  const children = all.filter(
    (entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/'),
  );
  const offset = Number(url.searchParams.get('offset') || 0);
  const pageSize = 200;
  return sendJson(response, {
    entries: children.slice(offset, offset + pageSize),
    truncated: false,
    next_offset: offset + pageSize < children.length ? offset + pageSize : null,
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  if (url.pathname === '/__perf/scenario' && request.method === 'POST') {
    const body = await readBody(request);
    scenario = { ...defaults, ...JSON.parse(body.toString('utf8') || '{}') };
    cachedLargeFiles = new Map();
    // Build the synthetic large files now: generating 20 MB inside the first
    // read would be charged to the viewer's file-ready time.
    for (const path of ['perf/large-table.csv', 'perf/large-log.txt']) {
      const file = largeFile(path);
      if (file) cachedLargeFiles.set(path, { ...file, bytes: Buffer.from(file.body) });
    }
    log = [];
    sendJson(response, scenario);
    return;
  }
  if (url.pathname === '/__perf/requests' && request.method === 'GET') {
    const entries = log;
    log = [];
    sendJson(response, { requests: entries });
    return;
  }
  const started = performance.now();
  const entry = {
    method: request.method,
    path: url.pathname,
    query: url.search,
    status: 0,
    bytes: 0,
    ms: 0,
  };
  if (!url.pathname.startsWith('/__test/')) log.push(entry);
  try {
    const body =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    const sessionMatch = syntheticSession.exec(url.pathname);
    const workspaceMatch = syntheticWorkspace.exec(url.pathname);
    const get = request.method === 'GET';
    if (get && url.pathname === '/v1/capabilities') {
      // The base fixture leaves context references off; the perf journeys
      // exercise the @-mention popover, so advertise them here.
      const base = await upstreamJson('/v1/capabilities');
      entry.status = 200;
      entry.bytes = sendJson(response, {
        ...base,
        capabilities: { ...base.capabilities, x_clio_context_references: { enabled: true } },
      });
    } else if (get && /^\/v1\/workspaces\/[^/]+\/references$/u.test(url.pathname)) {
      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const count = Math.max(40, Math.min(scenario.files, 400));
      const references = Array.from({ length: count }, (_, index) => {
        const path = `results/batch-${String(Math.floor(index / 20)).padStart(3, '0')}/sample-${String(index).padStart(5, '0')}.csv`;
        return {
          kind: 'workspace_file',
          id: path,
          label: path.split('/').pop(),
          detail: `${path} (12 KB)`,
          media_type: 'text/csv',
          revision: `stat:${index}:12288`,
          navigation: { path },
        };
      }).filter((reference) => !query || reference.id.includes(query));
      entry.status = 200;
      entry.bytes = sendJson(response, { references });
    } else if (get && url.pathname === '/v1/workspaces') {
      const base = await upstreamJson('/v1/workspaces');
      entry.status = 200;
      entry.bytes = sendJson(response, {
        workspaces: [...(base.workspaces ?? []), ...syntheticWorkspaces()],
      });
    } else if (get && url.pathname === '/v1/sessions') {
      entry.status = 200;
      entry.bytes = await handleSessions(url, response);
    } else if (get && sessionMatch?.[1] === HUGE_SESSION && sessionMatch[2] === '/messages') {
      const page = hugeTranscript(url);
      entry.status = 200;
      entry.unboundedTranscript = page.unbounded;
      entry.messages = page.returned;
      entry.bytes = sendJson(response, page.body);
    } else if (
      get &&
      (url.pathname === `/v1/workspaces/${BASE_WORKSPACE}/files` ||
        workspaceMatch?.[2] === '/files')
    ) {
      entry.status = 200;
      entry.bytes = await handleFiles(
        url,
        response,
        workspaceMatch ? workspaceMatch[1] : BASE_WORKSPACE,
      );
    } else if (
      get &&
      url.pathname.endsWith('/files/read') &&
      // Cached files first: generating a large file only to test the route costs seconds.
      (cachedLargeFiles.has(url.searchParams.get('path') ?? '') ||
        largeFile(url.searchParams.get('path') ?? '') ||
        seededFile(url.searchParams.get('path') ?? ''))
    ) {
      const path = url.searchParams.get('path') ?? '';
      if (!cachedLargeFiles.has(path))
        cachedLargeFiles.set(path, largeFile(path) ?? seededFile(path));
      const file = cachedLargeFiles.get(path);
      file.bytes ??= Buffer.from(file.body);
      // Ranged reads behave like the service's Starlette FileResponse (RFC 9110).
      const range = byteRange(request.headers.range, file.bytes.length);
      if (range === 'unsatisfiable') {
        response.writeHead(416, { ...cors, 'Content-Range': `bytes */${file.bytes.length}` });
        response.end();
        entry.status = 416;
        entry.bytes = 0;
      } else {
        const body = range ? file.bytes.subarray(range.start, range.end + 1) : file.bytes;
        response.writeHead(range ? 206 : 200, {
          ...cors,
          'Accept-Ranges': 'bytes',
          'Content-Type': file.type,
          ...(range
            ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.bytes.length}` }
            : {}),
        });
        response.end(body);
        entry.status = range ? 206 : 200;
        entry.bytes = body.length;
      }
    } else if (get && url.pathname === `/v1/sessions/${BASE_SESSION}/diffs`) {
      entry.status = 200;
      entry.bytes = sendJson(response, { diffs: [SEEDED_DIFF] });
    } else if (get && sessionMatch?.[2] === '/messages') {
      // Synthetic conversations other than the long one are short.
      const sid = sessionMatch[1];
      const first = hugeMessage(0, sid);
      const second = hugeMessage(1, sid);
      entry.status = 200;
      entry.bytes = sendJson(response, {
        messages: [first.message, second.message],
        tools: second.tools,
        tasks: [],
        subagents: [],
        artifacts: [],
        surfaces: [],
        next_cursor: null,
      });
    } else if (get && sessionMatch && !sessionMatch[2]) {
      const row = syntheticSessions().find((candidate) => candidate.id === sessionMatch[1]);
      entry.status = row ? 200 : 404;
      entry.bytes = sendJson(response, row ?? { error: 'not found' }, entry.status);
    } else if (sessionMatch || workspaceMatch) {
      const rewritten = `${url.pathname}${url.search}`
        .replace(sessionMatch?.[1] ?? '\u0000', BASE_SESSION)
        .replace(workspaceMatch?.[1] ?? '\u0000', BASE_WORKSPACE);
      entry.rewritten = true;
      await forward(request, response, url, body, entry, rewritten);
    } else if (get && url.pathname === `/v1/sessions/${BASE_SESSION}/messages`) {
      const page = pageTranscript(await upstreamJson(`/v1/sessions/${BASE_SESSION}/messages`), url);
      entry.status = 200;
      entry.unboundedTranscript = page.unbounded;
      entry.messages = page.returned;
      entry.bytes = sendJson(response, page.body);
    } else {
      await forward(request, response, url, body, entry);
    }
  } catch (error) {
    entry.status = 500;
    if (!response.headersSent) sendJson(response, { error: String(error) }, 500);
  } finally {
    entry.ms = Math.round(performance.now() - started);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`perf scale overlay on http://127.0.0.1:${port} -> fixture :${upstreamPort}`);
});
