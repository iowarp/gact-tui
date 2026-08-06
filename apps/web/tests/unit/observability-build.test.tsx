/**
 * buildObservabilityTrace unit locks (gact-tui#356 — trace-seeded, tree-wide).
 *
 * The observability layer is seeded from GET /v1/sessions/{sid}/trace for the
 * PARENT plus every child session — the only wire with per-tool occurred_at +
 * real duration_ms. Locks here:
 * - the trace→row mapping honors the wire's own payload keys (`tool`, NOT
 *   tool_name; `ok`; `duration_ms`; `call_id`),
 * - every row carries the raw occurred-at ms and the merged timeline is
 *   STRICTLY chronological across sessions (the old parts-seeding rendered
 *   two concatenated unsorted segments),
 * - owning agent and depth come from the trace session a row was recorded in,
 *   mapped by the agent-task records (parent=0 "main", children 1…),
 * - the gantt nests the root's own tool bars (spawn/wait) and the child
 *   agent spans beneath `main · turn N` roots, positioned by real times.
 */
import type { SemanticEventPayload, SessionAgentTask, SessionArtifactRecord } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  buildObservabilityTrace,
  mergeTimelineRows,
  timelineRowFromSemanticEvent,
  type SessionTraceEvents,
} from '../../src/observability/build';

const ROOT = 'sess_root';
const GEO_CHILD = 'sess_child_geo';
const VIS_CHILD = 'sess_child_vis';

/** Minute `m`, second `s` of a fixed UTC hour — readable real timestamps. */
function at(m: number, s: number, fraction = 0): string {
  const base = Date.UTC(2026, 7, 5, 22, m, s, fraction);
  return new Date(base).toISOString();
}

function ms(iso: string): number {
  return Date.parse(iso);
}

function ev(
  eventType: string,
  occurredAt: string,
  overrides: Partial<SemanticEventPayload> = {},
): SemanticEventPayload {
  return {
    event_id: '',
    event_type: eventType,
    occurred_at: occurredAt,
    status: 'completed',
    actor: {},
    subject: {},
    payload: {},
    ...overrides,
  } as SemanticEventPayload;
}

function toolStarted(occurredAt: string, callId: string, tool: string, args?: unknown, turnId?: string) {
  return ev('tool.call.started', occurredAt, {
    ...(turnId ? { turn_id: turnId } : {}),
    subject: { call_id: callId },
    payload: { call_id: callId, tool, ...(args !== undefined ? { args } : {}) },
  });
}

function toolCompleted(
  occurredAt: string,
  callId: string,
  tool: string,
  durationMs: number,
  ok = true,
  turnId?: string,
) {
  return ev('tool.call.completed', occurredAt, {
    ...(turnId ? { turn_id: turnId } : {}),
    subject: { call_id: callId },
    payload: { call_id: callId, tool, ok, duration_ms: durationMs },
  });
}

function geoTask(overrides: Record<string, unknown> = {}): SessionAgentTask {
  return {
    task_id: 'task_geo',
    status: 'completed',
    run_label: 'geospatial #1',
    child_session_id: GEO_CHILD,
    parent_turn_id: 'msg_user_t1',
    depth: 1,
    agent_ref: { expert_id: 'geospatial', requesting_expert_id: 'main' },
    created_at: at(53, 25),
    updated_at: at(54, 3),
    ...overrides,
  } as unknown as SessionAgentTask;
}

function visTask(overrides: Record<string, unknown> = {}): SessionAgentTask {
  return {
    task_id: 'task_vis',
    status: 'completed',
    run_label: 'visualization #1',
    child_session_id: VIS_CHILD,
    parent_turn_id: 'msg_user_t2',
    depth: 1,
    agent_ref: { expert_id: 'visualization', requesting_expert_id: 'main' },
    created_at: at(58, 25),
    updated_at: at(59, 16),
    ...overrides,
  } as unknown as SessionAgentTask;
}

const NO_ARTIFACTS: SessionArtifactRecord[] = [];

function build(traces: SessionTraceEvents[], agentTasks: SessionAgentTask[] = [], artifacts = NO_ARTIFACTS) {
  return buildObservabilityTrace({ rootSessionId: ROOT, traces, agentTasks, artifacts });
}

describe('trace→row mapping — the wire payload keys', () => {
  it("reads the tool name from payload key 'tool' (a tool_name key is not the wire and maps to nothing)", () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          ev('tool.call.completed', at(53, 29), {
            payload: { call_id: 'call_wrongkey', tool_name: 'geo_geocode', ok: true },
          }),
          toolCompleted(at(53, 30), 'call_1', 'geo_geocode', 2000),
        ],
      },
    ]);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.name).toBe('geo_geocode');
    expect(trace.timeline.filter((row) => row.kind === 'tool')).toHaveLength(1);
  });

  it('formats the duration from the real duration_ms and marks ok:false as failed', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolStarted(at(53, 24), 'call_1', 'ndp_resolve', { resource: 'MTA1' }),
          toolCompleted(at(53, 29), 'call_1', 'ndp_resolve', 4592.8, false),
        ],
      },
    ]);
    const row = trace.toolCalls[0]!;
    expect(row.state).toBe('failed');
    expect(row.duration).toBe('5s');
    expect(row.argHint).toBe('resource=MTA1');
    const timelineRow = trace.timeline.find((r) => r.actor === 'ndp_resolve')!;
    expect(timelineRow.kind).toBe('failure');
    expect(timelineRow.action).toBe('tool call failed');
    expect(timelineRow.duration).toBe('5s');
  });

  it('pairs started/completed by call_id into ONE row timed at the real start', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolStarted(at(53, 24, 700), 'call_1', 'spawn_agent_task'),
          toolCompleted(at(53, 29, 300), 'call_1', 'spawn_agent_task', 4592.8),
        ],
      },
    ]);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.atMs).toBe(ms(at(53, 24, 700)));
    expect(trace.toolCalls[0]!.state).toBe('done');
    // The timeline shows the call once (the completion row), not twice —
    // stamped at the call's real START, so it sorts before anything the
    // call itself produced mid-execution.
    expect(trace.timeline).toHaveLength(1);
    expect(trace.timeline[0]!.atMs).toBe(ms(at(53, 24, 700)));
  });

  it('renders a started call with no completion as running', () => {
    const trace = build([
      { sessionId: ROOT, events: [toolStarted(at(55, 0), 'call_1', 'stage_resource')] },
    ]);
    expect(trace.toolCalls[0]!.state).toBe('running');
    expect(trace.timeline[0]!.kind).toBe('running');
  });
});

/**
 * Round-9 owner finding: the transcript's own tool rows and the tools tab's
 * "available" inventory both render the wire's optional `tool_title` (a
 * display label a tool server stamps onto the call), but the tools tab's
 * "called" log — sourced from THIS trace→row mapping — kept printing the
 * raw `tool` name because toolCallRowsFromTrace never read the field at all.
 */
describe('trace→row mapping — tool_title (round-9 owner finding: "called" rows only ever printed the raw name)', () => {
  it('carries the completed payload\'s tool_title onto the row', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolStarted(at(53, 24), 'call_1', 'ndp_dataset_discovery'),
          ev('tool.call.completed', at(53, 29), {
            subject: { call_id: 'call_1' },
            payload: {
              call_id: 'call_1',
              tool: 'ndp_dataset_discovery',
              ok: true,
              duration_ms: 4592.8,
              tool_title: 'Discover datasets',
            },
          }),
        ],
      },
    ]);
    expect(trace.toolCalls[0]!.title).toBe('Discover datasets');
    expect(trace.toolCalls[0]!.name).toBe('ndp_dataset_discovery');
  });

  it('falls back to the started payload\'s tool_title when the completion carries none', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          ev('tool.call.started', at(53, 24), {
            subject: { call_id: 'call_1' },
            payload: { call_id: 'call_1', tool: 'ndp_dataset_discovery', tool_title: 'Discover datasets' },
          }),
          toolCompleted(at(53, 29), 'call_1', 'ndp_dataset_discovery', 4592.8),
        ],
      },
    ]);
    expect(trace.toolCalls[0]!.title).toBe('Discover datasets');
  });

  it('leaves title undefined for an old session with no tool_title on either payload', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolStarted(at(53, 24), 'call_1', 'ndp_dataset_discovery'),
          toolCompleted(at(53, 29), 'call_1', 'ndp_dataset_discovery', 4592.8),
        ],
      },
    ]);
    expect(trace.toolCalls[0]!.title).toBeUndefined();
    expect(trace.toolCalls[0]!.name).toBe('ndp_dataset_discovery');
  });

  it('a running call (no completion yet) still carries the started payload\'s tool_title', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          ev('tool.call.started', at(55, 0), {
            subject: { call_id: 'call_1' },
            payload: { call_id: 'call_1', tool: 'stage_resource', tool_title: 'Stage resource' },
          }),
        ],
      },
    ]);
    expect(trace.toolCalls[0]!.state).toBe('running');
    expect(trace.toolCalls[0]!.title).toBe('Stage resource');
  });
});

describe('trace→row mapping — owning agent and depth from the agent-task records', () => {
  const traces: SessionTraceEvents[] = [
    {
      sessionId: ROOT,
      events: [toolCompleted(at(53, 29), 'call_root', 'spawn_agent_task', 4592, true, 'msg_user_t1')],
    },
    {
      sessionId: GEO_CHILD,
      events: [toolCompleted(at(53, 50), 'call_child', 'geo_geocode', 10826)],
    },
  ];

  it('attributes each tool row to the trace session it came from', () => {
    const trace = build(traces, [geoTask()]);
    const spawn = trace.toolCalls.find((row) => row.name === 'spawn_agent_task')!;
    const geocode = trace.toolCalls.find((row) => row.name === 'geo_geocode')!;
    expect(spawn.agent).toBe('main');
    expect(geocode.agent).toBe('geospatial #1');
    // Child rows open the child agent; root rows jump to their turn message.
    expect(geocode.nav).toEqual({ kind: 'agent', targetId: GEO_CHILD });
    expect(spawn.nav).toEqual({ kind: 'message', targetId: 'msg_user_t1' });
  });

  it('assigns depth 0 to parent rows and the task record depth to child rows', () => {
    const trace = build(traces, [geoTask({ depth: 1 })]);
    expect(trace.timeline.find((r) => r.actor === 'spawn_agent_task')!.depth).toBe(0);
    expect(trace.timeline.find((r) => r.actor === 'geo_geocode')!.depth).toBe(1);
  });

  it('gives a traced session with no task record the honest minimum: depth 1, its id as agent', () => {
    const trace = build(traces, []);
    const geocode = trace.toolCalls.find((row) => row.name === 'geo_geocode')!;
    expect(geocode.agent).toBe(GEO_CHILD);
    expect(trace.timeline.find((r) => r.actor === 'geo_geocode')!.depth).toBe(1);
  });
});

describe('trace→row mapping — root-only rows and the branch brackets', () => {
  it('renders the root turn.started as the quoting user row with a message nav', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          ev('turn.started', at(53, 9), {
            subject: { message_id: 'msg_user_t1' },
            payload: { text: 'What recent ground-motion is EarthScope showing?' },
          }),
        ],
      },
    ]);
    const row = trace.timeline[0]!;
    expect(row.kind).toBe('user');
    expect(row.actor).toBe('user');
    expect(row.action).toContain('"What recent ground-motion');
    expect(row.nav).toEqual({ kind: 'message', targetId: 'msg_user_t1' });
  });

  it("suppresses a CHILD session's own turn bookkeeping (its task prompt is not the user's turn)", () => {
    const trace = build(
      [
        { sessionId: ROOT, events: [] },
        {
          sessionId: GEO_CHILD,
          events: [
            ev('turn.started', at(53, 25), { payload: { text: 'Resolve the place name…' } }),
            ev('routing.decision', at(53, 26), {
              payload: { route_source: 'agent_blueprint', selected_agent: 'geospatial' },
            }),
            ev('turn.completed', at(54, 3), { payload: { stop_reason: 'end_turn' } }),
          ],
        },
      ],
      [geoTask()],
    );
    expect(trace.timeline).toHaveLength(0);
  });

  it('maps delegation started/completed to branch open/close rows at the spawning depth, with agent nav', () => {
    const trace = build(
      [
        {
          sessionId: ROOT,
          events: [
            ev('blueprint.delegation.started', at(53, 29), {
              subject: { agent_id: 'geospatial', role: 'child_expert' },
              payload: { run_index: 0 },
            }),
            ev('blueprint.delegation.completed', at(54, 3), {
              actor: { agent_id: 'geospatial', role: 'child_expert' },
              payload: { agent_id: 'geospatial', parent_id: 'main', task_id: 'task_geo', status: 'completed' },
            }),
          ],
        },
      ],
      [geoTask()],
    );
    const [open, close] = trace.timeline;
    expect(open!.branch).toBe('open');
    expect(open!.depth).toBe(0);
    expect(open!.action).toBe('task started');
    expect(open!.nav).toEqual({ kind: 'agent', targetId: GEO_CHILD });
    expect(close!.branch).toBe('close');
    expect(close!.depth).toBe(0);
    expect(close!.action).toBe('returned to main');
    expect(close!.kind).toBe('event');
    expect(close!.nav).toEqual({ kind: 'agent', targetId: GEO_CHILD });
  });

  it('marks a failed delegation return as a failure row', () => {
    const row = timelineRowFromSemanticEvent(
      ev('blueprint.delegation.completed', at(54, 3), {
        payload: { agent_id: 'geospatial', parent_id: 'main', status: 'failed' },
      }),
      { root: true, depth: 0, sessionId: ROOT },
    )!;
    expect(row.kind).toBe('failure');
  });

  it('renders artifact.created (any session) with its real size', () => {
    const trace = build(
      [
        { sessionId: ROOT, events: [] },
        {
          sessionId: VIS_CHILD,
          events: [
            ev('artifact.created', at(59, 1), {
              subject: { name: 'MTA1.CI.LY_.30_position.png' },
              payload: { size_bytes: 179248 },
            }),
          ],
        },
      ],
      [visTask()],
    );
    const row = trace.timeline[0]!;
    expect(row.kind).toBe('artifact');
    expect(row.actor).toBe('MTA1.CI.LY_.30_position.png');
    // The ONE shared size formatter (round-10 gate finding D8: this used to
    // be a private decimal (bytes/1000) formatter, the only one of THREE
    // independently-computed byte formatters in this codebase not agreeing
    // with the other two — 179248 bytes is now humanSize's own binary
    // (bytes/1024) math, same as the artifacts tab's chip/panel.
    expect(row.action).toBe('artifact (175.0 KB)');
    expect(row.depth).toBe(1);
  });
});

describe('artifact.used — dedup-reuse rows in the artifacts tab (#1191, round-8 owner finding)', () => {
  // Wire shape verified against the emitter (clio versions.py emit_artifact_used):
  // subject={artifact_id, name, workspace_id}, payload={...subject, event_id,
  // version, session_id, reason:"same_sha_dedup"}. Before this, these events had
  // NO surface anywhere in the UI — reuse happened and was invisible.
  it('folds an artifact.used event into artifactRows, tagged `used`, with the real wire fields', () => {
    const trace = build(
      [
        { sessionId: ROOT, events: [] },
        {
          sessionId: VIS_CHILD,
          events: [
            ev('artifact.used', at(59, 1), {
              subject: {
                artifact_id: 'art_abc123',
                name: 'earthscope_converted_data.csv',
                workspace_id: 'ws_1',
              },
              payload: {
                artifact_id: 'art_abc123',
                name: 'earthscope_converted_data.csv',
                workspace_id: 'ws_1',
                version: 1,
                session_id: VIS_CHILD,
                reason: 'same_sha_dedup',
              },
            }),
          ],
        },
      ],
      [visTask()],
    );
    expect(trace.artifactRows).toHaveLength(1);
    const row = trace.artifactRows[0]!;
    expect(row.name).toBe('earthscope_converted_data.csv');
    expect(row.id).toBe('art_abc123');
    expect(row.used).toBe(true);
    expect(row.meta).toBe('v1 · dedup');
    // Names the session that DID the dedup use — there is no minting
    // producer to report for a reuse, only a use.
    expect(row.producer).toBe('visualization #1');
  });

  it('never fabricates a row for any other event_type', () => {
    const trace = build([
      { sessionId: ROOT, events: [ev('artifact.transform.recorded', at(59, 1))] },
    ]);
    expect(trace.artifactRows).toHaveLength(0);
  });

  it('drops a used event with no name rather than rendering a blank row', () => {
    const trace = build([
      { sessionId: ROOT, events: [ev('artifact.used', at(59, 1), { subject: {}, payload: {} })] },
    ]);
    expect(trace.artifactRows).toHaveLength(0);
  });

  it('merges used rows chronologically alongside minted versions, both present and distinct', () => {
    const minted: SessionArtifactRecord[] = [
      {
        name: 'station.csv',
        kind: 'dataset',
        workspace_id: 'ws_1',
        head_artifact_id: 'art_minted',
        latest_version: 1,
        versions: [
          {
            artifact_id: 'art_minted',
            name: 'station.csv',
            version: 1,
            kind: 'dataset',
            size_bytes: 128,
            created_at: at(55, 0),
          },
        ],
      } as unknown as SessionArtifactRecord,
    ];
    const trace = build(
      [
        { sessionId: ROOT, events: [] },
        {
          sessionId: VIS_CHILD,
          events: [
            ev('artifact.used', at(59, 1), {
              subject: { artifact_id: 'art_used', name: 'earthscope_converted_data.csv' },
              payload: { artifact_id: 'art_used', name: 'earthscope_converted_data.csv', version: 1 },
            }),
          ],
        },
      ],
      [visTask()],
      minted,
    );
    expect(trace.artifactRows).toHaveLength(2);
    // Chronological: the mint (55:00) sorts before the use (59:01).
    expect(trace.artifactRows[0]!.name).toBe('station.csv');
    expect(trace.artifactRows[0]!.used).toBeUndefined();
    expect(trace.artifactRows[1]!.name).toBe('earthscope_converted_data.csv');
    expect(trace.artifactRows[1]!.used).toBe(true);
  });
});

describe('chronological merge — strictly sorted across sessions', () => {
  it('interleaves parent and child rows by raw occurred-at ms, not per-trace segments', () => {
    // Deliberately out of order: the child trace's events fall BETWEEN the
    // parent's — the old parts-seeding would have appended them as a second
    // unsorted segment (measured 17:53 → 18:01 → 17:55).
    const trace = build(
      [
        {
          sessionId: ROOT,
          events: [
            toolCompleted(at(53, 29), 'call_spawn', 'spawn_agent_task', 4592),
            toolCompleted(at(54, 4), 'call_wait', 'wait_agent_tasks', 29827),
          ],
        },
        {
          sessionId: GEO_CHILD,
          events: [toolCompleted(at(53, 50), 'call_geo', 'geo_geocode', 10826)],
        },
      ],
      [geoTask()],
    );
    expect(trace.timeline.map((row) => row.actor)).toEqual([
      'spawn_agent_task',
      'geo_geocode',
      'wait_agent_tasks',
    ]);
    const times = trace.timeline.map((row) => row.atMs!);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // The tools tab sorts by the same key.
    expect(trace.toolCalls.map((row) => row.name)).toEqual([
      'spawn_agent_task',
      'geo_geocode',
      'wait_agent_tasks',
    ]);
  });

  it('mergeTimelineRows appends only rows PAST the seed watermark, in chronological position', () => {
    const seeded = [
      { actor: 'a', action: 'x', kind: 'event' as const, atMs: 1000, sourceId: 'sem:1' },
      { actor: 'c', action: 'x', kind: 'event' as const, atMs: 3000, sourceId: 'sem:3' },
    ];
    const live = [
      // Two genuinely new rows arriving out of order, beyond the seed
      // horizon plus the cross-surface stamp-skew pad (2s).
      { actor: 'e', action: 'x', kind: 'event' as const, atMs: 9000, sourceId: 'sem:5' },
      { actor: 'd', action: 'x', kind: 'event' as const, atMs: 8000, sourceId: 'sem:4' },
    ];
    const merged = mergeTimelineRows(seeded, live);
    expect(merged.map((row) => row.actor)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('mergeTimelineRows drops SSE backlog replays of history the seed already covers', () => {
    // Live-verified (sess_c6241fc8906f): the SSE stream replays a backlog on
    // connect whose copies of already-traced events carry DIFFERENT
    // event_id/occurred_at stamps (~300ms apart) — id equality cannot catch
    // them, the watermark must.
    const seeded = [
      { actor: 'geospatial', action: 'returned to main', kind: 'event' as const, atMs: 10000, sourceId: 'sem:trace-stamp' },
    ];
    const live = [
      // The same logical event off the SSE backlog: different id AND a
      // slightly different timestamp — the highway's copy of the seed's own
      // newest event can even land a few hundred ms PAST the seed stamp,
      // which is what the skew pad absorbs.
      { actor: 'geospatial', action: 'returned to main', kind: 'event' as const, atMs: 10300, sourceId: 'sem:highway-stamp' },
      // An exact replay of a seeded row (same sourceId) at the horizon.
      { actor: 'geospatial', action: 'returned to main', kind: 'event' as const, atMs: 10000, sourceId: 'sem:trace-stamp' },
      // A genuinely new event beyond horizon + skew survives.
      { actor: 'main', action: 'tool call', kind: 'tool' as const, atMs: 15000, sourceId: 'sem:new' },
    ];
    const merged = mergeTimelineRows(seeded, live);
    expect(merged.map((row) => row.sourceId)).toEqual(['sem:trace-stamp', 'sem:new']);
  });

  it('sorts rows with no timestamp after every timed row instead of guessing a time', () => {
    const merged = mergeTimelineRows(
      [{ actor: 'untimed', action: 'x', kind: 'event' as const, sourceId: 's1' }],
      [{ actor: 'timed', action: 'x', kind: 'event' as const, atMs: 1, sourceId: 's2' }],
    );
    expect(merged.map((row) => row.actor)).toEqual(['timed', 'untimed']);
  });
});

describe('gantt nesting — main · turn N roots, real-time bars and marks', () => {
  const rootEvents = [
    ev('turn.started', at(53, 9), { turn_id: 'msg_user_t1' }),
    toolStarted(at(53, 24, 700), 'call_spawn', 'spawn_agent_task', undefined, 'msg_user_t1'),
    toolCompleted(at(53, 29, 300), 'call_spawn', 'spawn_agent_task', 4600, true, 'msg_user_t1'),
    toolStarted(at(53, 34, 700), 'call_wait', 'wait_agent_tasks', undefined, 'msg_user_t1'),
    toolCompleted(at(54, 4, 500), 'call_wait', 'wait_agent_tasks', 29800, true, 'msg_user_t1'),
    ev('turn.completed', at(54, 10), { turn_id: 'msg_user_t1' }),
    ev('turn.started', at(58, 20), { turn_id: 'msg_user_t2' }),
    ev('turn.completed', at(59, 20), { turn_id: 'msg_user_t2' }),
  ];
  const childEvents = [toolCompleted(at(53, 50), 'call_geo', 'geo_geocode', 10826)];

  it('nests the root tool bars and agent spans beneath their turn roots, chronologically', () => {
    const trace = build(
      [
        { sessionId: ROOT, events: rootEvents },
        { sessionId: GEO_CHILD, events: childEvents },
      ],
      [geoTask(), visTask()],
    );
    expect(trace.spans.map((span) => span.label)).toEqual([
      'main · turn 1',
      'spawn_agent_task',
      'geospatial #1',
      'wait_agent_tasks',
      'main · turn 2',
      'visualization #1',
    ]);
    const turn1 = trace.spans[0]!;
    expect(turn1.depth).toBe(0);
    expect(turn1.startMs).toBe(ms(at(53, 9)));
    expect(turn1.endMs).toBe(ms(at(54, 10)));
    expect(turn1.state).toBe('done');
    expect(turn1.nav).toEqual({ kind: 'message', targetId: 'msg_user_t1' });
  });

  it('positions every tool bar at its REAL start with width = real duration_ms', () => {
    const trace = build(
      [
        { sessionId: ROOT, events: rootEvents },
        { sessionId: GEO_CHILD, events: childEvents },
      ],
      [geoTask()],
    );
    const wait = trace.spans.find((span) => span.label === 'wait_agent_tasks')!;
    expect(wait.tool).toBe(true);
    expect(wait.depth).toBe(1);
    expect(wait.startMs).toBe(ms(at(53, 34, 700)));
    expect(wait.endMs).toBe(ms(at(53, 34, 700)) + 29800);
    // The wait bar covers the tail of the child span it blocked on.
    const child = trace.spans.find((span) => span.label === 'geospatial #1')!;
    expect(wait.startMs).toBeGreaterThan(child.startMs);
    expect(wait.startMs).toBeLessThan(child.endMs!);
    expect(wait.endMs!).toBeGreaterThanOrEqual(child.endMs!);
  });

  it("rides each child's real tool calls as wrench marks on its agent span", () => {
    const trace = build(
      [
        { sessionId: ROOT, events: rootEvents },
        { sessionId: GEO_CHILD, events: childEvents },
      ],
      [geoTask()],
    );
    const child = trace.spans.find((span) => span.label === 'geospatial #1')!;
    expect(child.toolMarks).toEqual([
      // No started event in the fixture trace: the real start derives from
      // the completion's own timestamp minus its reported duration_ms.
      { atMs: ms(at(53, 50)) - 10826, label: 'geo_geocode' },
    ]);
  });

  it('keeps a running turn (no turn.completed) running, and orphan tasks appended chronologically', () => {
    const trace = build(
      [{ sessionId: ROOT, events: [ev('turn.started', at(53, 9), { turn_id: 'msg_user_t1' })] }],
      [geoTask({ parent_turn_id: 'msg_user_unknown', status: 'running', live_state: 'running' })],
    );
    expect(trace.spans[0]!.state).toBe('running');
    expect(trace.spans[0]!.endMs).toBeNull();
    // The task's turn is unknown to the trace — appended after the roots,
    // never silently dropped.
    expect(trace.spans.map((span) => span.label)).toEqual(['main · turn 1', 'geospatial #1']);
  });
});

describe('a child session viewed directly keeps its own scope', () => {
  it('renders the child trace as its own root: turn rows visible, tools owned by the scope root', () => {
    const trace = buildObservabilityTrace({
      rootSessionId: GEO_CHILD,
      traces: [
        {
          sessionId: GEO_CHILD,
          events: [
            ev('turn.started', at(53, 25), {
              subject: { message_id: 'msg_user_child' },
              payload: { text: 'Resolve the place name Los Angeles…' },
            }),
            toolCompleted(at(53, 50), 'call_geo', 'geo_geocode', 10826),
            ev('turn.completed', at(54, 3), { turn_id: 'msg_user_child', payload: { stop_reason: 'end_turn' } }),
          ],
        },
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    expect(trace.timeline.map((row) => row.actor)).toEqual([
      'user',
      'geo_geocode',
      'turn.completed',
    ]);
    expect(trace.timeline.every((row) => row.depth === 0)).toBe(true);
    expect(trace.toolCalls[0]!.agent).toBe('main');
    expect(trace.spans.map((span) => span.label)).toEqual(['main · turn 1', 'geo_geocode']);
  });
});
