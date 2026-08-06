/**
 * Tools tab "called | available" toggle (server contract:
 * clio-agent's `agent.toolset.recorded` semantic-trace event — ONE per
 * built react expert, payload `{agent_id, session_id, tools:
 * [{name, title, source, representation}]}`).
 *
 * Two halves locked here:
 * - build.ts's `toolInventoryFromTraces` (exercised through
 *   `buildObservabilityTrace`): parses the event VERBATIM into one group per
 *   agent, main first then children in first-recorded order, latest event
 *   per agent wins.
 * - Observability.tsx's segmented toggle: 'called' (unchanged ToolLog),
 *   'available' (the new grouped/collapsible inventory), and the honest
 *   unavailable state for a session with no recorded inventory.
 */
import type { SemanticEventPayload, SessionAgentTask, SessionArtifactRecord } from '@clio/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildObservabilityTrace, type SessionTraceEvents } from '../../src/observability/build';
import { Observability } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';

const ROOT = 'sess_root';
const CHILD = 'sess_child_geo';

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

function toolsetRecorded(
  occurredAt: string,
  agentId: string,
  tools: Array<Record<string, unknown>>,
  sessionId = ROOT,
) {
  return ev('agent.toolset.recorded', occurredAt, {
    payload: { agent_id: agentId, session_id: sessionId, tools },
  });
}

const NO_ARTIFACTS: SessionArtifactRecord[] = [];

function build(traces: SessionTraceEvents[], agentTasks: SessionAgentTask[] = []) {
  return buildObservabilityTrace({
    rootSessionId: ROOT,
    traces,
    agentTasks,
    artifacts: NO_ARTIFACTS,
  });
}

describe('build.ts: toolInventoryFromTraces (event → inventory parsing)', () => {
  it('maps one agent.toolset.recorded event verbatim into a single group', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolsetRecorded('2026-08-05T00:00:00Z', 'main', [
            { name: 'create_artifact', title: 'artifact(create)', source: 'native', representation: 'chip' },
            { name: 'spawn_agent_task', title: 'spawn(agent)', source: 'spawn-runtime', representation: 'handoff' },
          ]),
        ],
      },
    ]);
    expect(trace.toolInventory.groups).toHaveLength(1);
    const group = trace.toolInventory.groups[0]!;
    expect(group.agentId).toBe('main');
    expect(group.tools).toEqual([
      { name: 'create_artifact', title: 'artifact(create)', source: 'native', representation: 'chip' },
      {
        name: 'spawn_agent_task',
        title: 'spawn(agent)',
        source: 'spawn-runtime',
        representation: 'handoff',
      },
    ]);
  });

  it('orders groups main-first, then children in first-recorded order across the trace set', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [toolsetRecorded('2026-08-05T00:00:01Z', 'main', [{ name: 'write_todos', source: 'native' }])],
      },
      {
        sessionId: CHILD,
        events: [
          toolsetRecorded(
            '2026-08-05T00:00:05Z',
            'geospatial',
            [{ name: 'geo_geocode', source: 'osm' }],
            CHILD,
          ),
        ],
      },
    ]);
    expect(trace.toolInventory.groups.map((g) => g.agentId)).toEqual(['main', 'geospatial']);
  });

  it('a rebuilt agent (repeat event, SAME agent_id) keeps its first-seen order slot but the LATEST toolset', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolsetRecorded('2026-08-05T00:00:01Z', 'main', [{ name: 'write_todos', source: 'native' }]),
          toolsetRecorded('2026-08-05T00:05:00Z', 'geospatial', [{ name: 'geo_geocode', source: 'osm' }]),
          // main rebuilds later in the SAME session (e.g. a second turn) —
          // the group must reflect this LATEST toolset, not a stale union.
          toolsetRecorded('2026-08-05T00:10:00Z', 'main', [
            { name: 'write_todos', source: 'native' },
            { name: 'create_artifact', source: 'native' },
          ]),
        ],
      },
    ]);
    expect(trace.toolInventory.groups.map((g) => g.agentId)).toEqual(['main', 'geospatial']);
    expect(trace.toolInventory.groups[0]!.tools.map((t) => t.name)).toEqual([
      'write_todos',
      'create_artifact',
    ]);
  });

  it('drops a malformed tool entry (no name) rather than inventing one', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [
          toolsetRecorded('2026-08-05T00:00:00Z', 'main', [
            { name: 'write_todos', source: 'native' },
            { title: 'nameless', source: 'native' },
            'not-an-object' as unknown as Record<string, unknown>,
          ]),
        ],
      },
    ]);
    expect(trace.toolInventory.groups[0]!.tools.map((t) => t.name)).toEqual(['write_todos']);
  });

  it('defaults an absent title to undefined (never fabricated) and defaults missing source/representation honestly', () => {
    const trace = build([
      {
        sessionId: ROOT,
        events: [toolsetRecorded('2026-08-05T00:00:00Z', 'main', [{ name: 'goal_status' }])],
      },
    ]);
    const tool = trace.toolInventory.groups[0]!.tools[0]!;
    expect(tool.name).toBe('goal_status');
    expect(tool.title).toBeUndefined();
    expect(tool.source).toBe('unknown');
    expect(tool.representation).toBe('row');
  });

  it('a session with no agent.toolset.recorded events at all yields an EMPTY groups list (never a fabricated placeholder)', () => {
    const trace = build([
      { sessionId: ROOT, events: [ev('tool.call.completed', '2026-08-05T00:00:00Z')] },
    ]);
    expect(trace.toolInventory.groups).toEqual([]);
  });
});

// ---- Observability.tsx: the toggle + grouped/collapsible render ----

function data(overrides: Partial<ObservabilityData> = {}): ObservabilityData {
  return {
    agents: [],
    runs: [],
    toolsByExpert: {},
    artifacts: [],
    timeline: [],
    spans: [],
    artifactRows: [],
    toolCalls: [
      { sourceId: 'call:1', name: 'geo_geocode', agent: 'geospatial', state: 'done', at: '19:55' },
    ],
    toolInventory: { groups: [] },
    ...overrides,
  };
}

describe('Observability: tools tab called|available toggle', () => {
  it('defaults to "called" (the unchanged chronological call log)', () => {
    render(<Observability data={data()} initialTab="tools" />);
    const toggle = screen.getByRole('group', { name: /tools view/i });
    expect(within(toggle).getByRole('button', { name: 'called' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(toggle).getByRole('button', { name: 'available' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('obs-tools')).toBeInTheDocument();
    expect(screen.getByText('geo_geocode')).toBeInTheDocument();
  });

  it('switches to the available inventory on click, flipping aria-pressed', () => {
    render(
      <Observability
        data={data({
          toolInventory: {
            groups: [{ agentId: 'main', tools: [{ name: 'write_todos', source: 'native', representation: 'row' }] }],
          },
        })}
        initialTab="tools"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    expect(screen.getByRole('button', { name: 'available' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'called' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('obs-tools-available')).toBeInTheDocument();
    // The called-view row is gone once switched away.
    expect(screen.queryByText('geo_geocode')).toBeNull();
  });

  it('groups by agent with a collapsible header "agent-name (N tools)", rows reading "title — name · source"', () => {
    render(
      <Observability
        data={data({
          toolInventory: {
            groups: [
              {
                agentId: 'main',
                tools: [
                  { name: 'create_artifact', title: 'artifact(create)', source: 'native', representation: 'chip' },
                  { name: 'spawn_agent_task', source: 'spawn-runtime', representation: 'handoff' },
                ],
              },
              {
                agentId: 'geospatial',
                tools: [{ name: 'geo_geocode', source: 'osm', representation: 'row' }],
              },
            ],
          },
        })}
        initialTab="tools"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    const panel = screen.getByTestId('obs-tools-available');

    const mainHeader = within(panel).getByRole('button', { name: /main/ });
    expect(mainHeader).toHaveTextContent('main');
    expect(mainHeader).toHaveTextContent('(2 tools)');
    expect(within(panel).getByRole('button', { name: /geospatial/ })).toHaveTextContent('(1 tools)');

    // Curated title rides "title — name"; an uncurated row is bare "name".
    expect(within(panel).getByText('artifact(create) — create_artifact')).toBeInTheDocument();
    expect(within(panel).getByText('spawn_agent_task')).toBeInTheDocument();
    // Source rides its own muted span, middot-prefixed.
    expect(within(panel).getByText('· native')).toBeInTheDocument();
    expect(within(panel).getByText('· spawn-runtime')).toBeInTheDocument();
    expect(within(panel).getByText('· osm')).toBeInTheDocument();
  });

  it('collapses a group on header click, hiding its rows; clicking again re-expands', () => {
    render(
      <Observability
        data={data({
          toolInventory: {
            groups: [
              { agentId: 'main', tools: [{ name: 'write_todos', source: 'native', representation: 'row' }] },
            ],
          },
        })}
        initialTab="tools"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    const header = screen.getByRole('button', { name: /main/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('write_todos')).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('write_todos')).toBeNull();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('write_todos')).toBeInTheDocument();
  });

  it('renders the honest unavailable state for a session with no recorded inventory — never an empty list read as "no tools"', () => {
    render(<Observability data={data({ toolInventory: { groups: [] } })} initialTab="tools" />);
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    expect(screen.getByTestId('obs-empty')).toHaveTextContent(
      /inventory unavailable for sessions recorded before toolset events/i,
    );
    // Distinct from the OLD legacy per-server-catalog empty text and from the
    // called-view's own "no tool calls recorded" message.
    expect(screen.queryByText(/no tool calls recorded/i)).toBeNull();
  });

  it('a genuinely failed trace read shows the retry state, not the "predates the event" honest-empty text', () => {
    const onRetryTrace = () => {};
    render(
      <Observability
        data={data({ toolInventory: { groups: [] }, traceReadFailed: true })}
        initialTab="tools"
        onRetryTrace={onRetryTrace}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    expect(screen.getByTestId('obs-unavailable')).toHaveTextContent(/tool inventory unavailable/i);
    expect(screen.queryByTestId('obs-empty')).toBeNull();
  });

  it('undefined toolInventory (pre-P5 fixture) renders the same honest unavailable state, not a crash', () => {
    const { toolInventory: _drop, ...rest } = data();
    render(<Observability data={rest as ObservabilityData} initialTab="tools" />);
    fireEvent.click(screen.getByRole('button', { name: 'available' }));
    expect(screen.getByTestId('obs-empty')).toHaveTextContent(/inventory unavailable/i);
  });
});
