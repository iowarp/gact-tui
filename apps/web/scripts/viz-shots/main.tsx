/**
 * Visual bench for the three rebuilt observability surfaces (viz rebuild,
 * 2026-08): the gantt, the timeline log's git-branch rail, and the provenance
 * lineage DAG.
 *
 * WHY THIS EXISTS: the surfaces were rebuilt against a live fanout session
 * (round 8, `sess_1ab89c7442a8`), but that backend's session store was reset —
 * `GET /v1/sessions` on 127.0.0.1:17900 returns an empty list — so there is no
 * live session left to point the screenshot pass at. This bench mounts the
 * REAL components with data in the exact shape the wire produces (`ObsSpan`,
 * `ObsTimelineRow`, `RouteStep`), so the screenshots show the real rendering,
 * not a mock of it. It is a probe, not app surface: it lives under scripts/,
 * has its own vite config, and is never part of the production build.
 *
 * Run: `npx vite --config scripts/viz-shots/vite.config.mts`
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Observability } from '../../src/observability/Observability';
import { DetailSlot } from '../../src/detail/DetailSlot';
import type { ObservabilityData, ObsSpan, ObsTimelineRow } from '../../src/observability/types';
import type { ArtifactRecord, RouteStep } from '../../src/detail/types';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';

/** Anchored to a real recent instant, the way a captured session's stamps are:
 *  the last two spans are still RUNNING, and a running bar extends to the wall
 *  clock, so synthetic 1970 offsets would put the axis decades wide. */
const T0 = Date.now() - 300_000;
const s = (seconds: number) => T0 + seconds * 1000;

/**
 * A fanout turn shaped exactly like build.ts emits: main's turn bars, main's
 * own spawn/wait tool bars nested inside them, and four child agents — three
 * genuinely concurrent (the case the old gantt could not tell apart) plus one
 * still running.
 */
const spans: ObsSpan[] = [
  {
    id: 'turn:m1',
    label: 'main · turn 1',
    depth: 0,
    startMs: s(0),
    endMs: s(214),
    state: 'done',
    duration: '3m 34s',
  },
  {
    id: 'tool:root:c1',
    label: 'spawn_agents_parallel',
    depth: 1,
    startMs: s(11),
    endMs: s(13),
    state: 'done',
    duration: '2.1s',
    tool: true,
  },
  {
    id: 'tool:root:c2',
    label: 'wait_agent_tasks',
    depth: 1,
    startMs: s(13),
    endMs: s(196),
    state: 'done',
    duration: '3m 3s',
    tool: true,
  },
  {
    id: 'task:ndp1',
    label: 'ndp #1',
    depth: 1,
    startMs: s(14),
    endMs: s(133),
    state: 'done',
    duration: '1m 59s',
    artifacts: 2,
    artifactAtMs: [s(96), s(128)],
    toolMarks: [
      { atMs: s(21), label: 'ndp_dataset_discovery' },
      { atMs: s(58), label: 'ndp_stage_resource' },
      { atMs: s(112), label: 'create_artifact' },
    ],
    nav: { kind: 'agent', targetId: 'sess_child_1' },
  },
  {
    id: 'task:geo1',
    label: 'geospatial #1',
    depth: 1,
    startMs: s(15),
    endMs: s(88),
    state: 'done',
    duration: '1m 13s',
    artifacts: 1,
    artifactAtMs: [s(80)],
    toolMarks: [
      { atMs: s(24), label: 'geo_geocode' },
      { atMs: s(61), label: 'geo_station_filter' },
    ],
    nav: { kind: 'agent', targetId: 'sess_child_2' },
  },
  {
    id: 'task:plot1',
    label: 'plot #1',
    depth: 1,
    startMs: s(17),
    endMs: s(195),
    state: 'done',
    duration: '2m 58s',
    artifacts: 3,
    artifactAtMs: [s(150), s(168), s(188)],
    toolMarks: [
      { atMs: s(30), label: 'plot_timeseries' },
      { atMs: s(140), label: 'plot_timeseries' },
      { atMs: s(178), label: 'create_artifact' },
    ],
    nav: { kind: 'agent', targetId: 'sess_child_3' },
  },
  {
    id: 'task:report1',
    label: 'report #1',
    depth: 1,
    startMs: s(140),
    endMs: s(212),
    state: 'failed',
    duration: '1m 12s',
    toolMarks: [{ atMs: s(160), label: 'create_artifact' }],
    nav: { kind: 'agent', targetId: 'sess_child_4' },
  },
  {
    id: 'turn:m2',
    label: 'main · turn 2',
    depth: 0,
    startMs: s(240),
    endMs: null,
    state: 'running',
  },
  {
    id: 'task:ndp2',
    label: 'ndp #2',
    depth: 1,
    startMs: s(248),
    endMs: null,
    state: 'running',
    toolMarks: [{ atMs: s(255), label: 'ndp_dataset_discovery' }],
    nav: { kind: 'agent', targetId: 'sess_child_5' },
  },
];

const clock = (at: number) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

const timeline: ObsTimelineRow[] = [
  { at: clock(s(0)), atMs: s(0), actor: 'user', action: '"Ground motion near LA…"', kind: 'user', depth: 0, agent: 'main' },
  { at: clock(s(9)), atMs: s(9), actor: 'routing_decision', action: 'react → main', kind: 'event', depth: 0, agent: 'main' },
  { at: clock(s(14)), atMs: s(14), actor: 'ndp #1', action: 'task started', kind: 'running', depth: 0, branch: 'open', agent: 'main' },
  { at: clock(s(21)), atMs: s(21), actor: 'ndp_dataset_discovery', action: 'tool call', duration: '6.2s', kind: 'tool', depth: 1, agent: 'ndp #1' },
  { at: clock(s(15)), atMs: s(24), actor: 'geospatial #1', action: 'task started', kind: 'running', depth: 0, branch: 'open', agent: 'main' },
  { at: clock(s(24)), atMs: s(26), actor: 'geo_geocode', action: 'tool call', duration: '2.8s', kind: 'tool', depth: 1, agent: 'geospatial #1' },
  { at: clock(s(58)), atMs: s(58), actor: 'ndp_stage_resource', action: 'tool call', duration: '31.4s', kind: 'tool', depth: 1, agent: 'ndp #1' },
  { at: clock(s(80)), atMs: s(80), actor: 'stations_clean.csv', action: 'artifact (214 KB)', kind: 'artifact', depth: 1, agent: 'geospatial #1' },
  { at: clock(s(88)), atMs: s(88), actor: 'geospatial #1', action: 'returned to main', kind: 'event', depth: 0, branch: 'close', agent: 'main' },
  { at: clock(s(96)), atMs: s(96), actor: 'MTA1.CI.LY_.30.csv', action: 'artifact (50.4 MB)', kind: 'artifact', depth: 1, agent: 'ndp #1' },
  { at: clock(s(112)), atMs: s(112), actor: 'create_artifact', action: 'tool call', duration: '1.4s', kind: 'tool', depth: 1, agent: 'ndp #1' },
  { at: clock(s(133)), atMs: s(133), actor: 'ndp #1', action: 'returned to main', kind: 'event', depth: 0, branch: 'close', agent: 'main' },
  { at: clock(s(140)), atMs: s(140), actor: 'report #1', action: 'task started', kind: 'running', depth: 0, branch: 'open', agent: 'main' },
  { at: clock(s(160)), atMs: s(160), actor: 'create_artifact', action: 'tool call failed', duration: '0.9s', kind: 'failure', depth: 1, agent: 'report #1' },
  { at: clock(s(212)), atMs: s(212), actor: 'report #1', action: 'returned to main', kind: 'failure', depth: 0, branch: 'close', agent: 'main' },
  { at: clock(s(214)), atMs: s(214), actor: 'turn.completed', action: 'stop_reason end_turn', kind: 'event', depth: 0, agent: 'main' },
  { at: clock(s(248)), atMs: s(248), actor: 'ndp #2', action: 'task started', kind: 'running', depth: 0, branch: 'open', agent: 'main' },
  { at: clock(s(255)), atMs: s(255), actor: 'ndp_dataset_discovery', action: 'tool call', kind: 'running', depth: 1, agent: 'ndp #2' },
];

const obsData: ObservabilityData = {
  agents: [],
  runs: [],
  toolsByExpert: {},
  artifacts: [],
  timeline,
  spans,
  artifactRows: [],
  toolCalls: [],
};

/** A cross-session, multi-input lineage: a foreign session minted the CSV, an
 *  in-tree agent-run produced the PNG, and both plus a third input converge on
 *  one `create_artifact` activity that generated the report. */
const route: RouteStep[] = [
  {
    kind: 'node',
    nodeType: 'activity',
    label: 'ndp_stage_resource',
    tool: 'ndp_stage_resource',
    duration: '1.7s',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
  },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 0, toIndex: 2 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30.csv',
    artifactId: 'art_csv',
    version: 'v1',
    size: '50.4 MB',
    createdAt: '2026-08-05T12:43:10Z',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
  },
  { kind: 'edge', edge: 'used', stance: 'hashed-at-use', join: true, fromIndex: 2, toIndex: 8 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30_position.png',
    artifactId: 'art_png',
    version: 'v1',
    size: '179 KB',
    sessionId: 'sess_child_3',
    treeSession: true,
    runLabel: 'plot #1',
  },
  { kind: 'edge', edge: 'used', stance: 'declared', join: true, fromIndex: 4, toIndex: 8 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'stations_clean.csv',
    artifactId: 'art_stations',
    version: 'v1',
    size: '214 KB',
  },
  { kind: 'edge', edge: 'used', stance: 'declared', join: true, fromIndex: 6, toIndex: 8 },
  {
    kind: 'node',
    nodeType: 'activity',
    label: 'create_artifact',
    tool: 'create_artifact',
    duration: '0.6s',
    status: 'gap',
  },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 8, toIndex: 10 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1_LA_ground_motion_report.md',
    artifactId: 'art_report',
    version: 'v1',
    size: '5.7 KB',
    self: true,
  },
];

const record: ArtifactRecord = {
  id: 'art_report',
  recordKind: 'artifact',
  breadcrumb: ['session', 'MTA1_LA_ground_motion_report.md'],
  kind: 'markdown',
  size: '5.7 KB',
  sha: '9f17aa20bb31c6241fc8906fa4d2e5b7',
  mechanism: 'model',
  designation: 'agent-proposed',
  evidence: 'hashed-at-use',
  custody: 'workspace-referenced',
  revision: 'v1',
  instrument: 'create_artifact(path="reports/MTA1_LA_ground_motion_report.md")',
  transformStatus: 'gap',
  route,
  sessionTitles: { sess_9f17aa20bb31: 'EarthScope staging run' },
};

function Bench() {
  return (
    <div style={{ display: 'flex', gap: '18px', padding: '18px', alignItems: 'flex-start' }}>
      <div id="bench-obs" style={{ width: '860px', background: 'var(--t-sf)', border: '1px solid var(--t-bd2)', borderRadius: '10px', padding: '14px' }}>
        <Observability
          data={obsData}
          onNavigate={() => {}}
          onOpenArtifact={() => {}}
        />
      </div>
      <div id="bench-detail" style={{ width: '520px', height: '760px', background: 'var(--t-sf)', border: '1px solid var(--t-bd2)', borderRadius: '10px', overflow: 'hidden' }}>
        <DetailSlot
          record={record}
          onClose={() => {}}
          onOpenSession={() => {}}
          onOpenArtifact={() => {}}
        />
      </div>
    </div>
  );
}

const host = document.getElementById('root');
if (!host) throw new Error('#root missing');
createRoot(host).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
