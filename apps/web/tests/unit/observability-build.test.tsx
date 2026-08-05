/**
 * buildObservabilityTrace unit locks (P5 grind, PASS 1 — observability).
 *
 * Prototype truth: the timeline's opening row is always the user's own turn
 * (design/prototype/Clio Session.html ~8327532, `row('19:52','user', …,
 * {isUser:true, jumpMsg:'msg-u1'})`); rows carry a real click-through target
 * only when one genuinely exists (`r.go`/`goTitle`, ~8472858 — jumpMsg scrolls
 * the transcript, `childViews[name]` opens the child agent's session); and the
 * tools tab is a chronological log of real calls (`obsToolRows`, ~8256494),
 * not a static per-server catalog.
 */
import type { Message, SessionAgentTask, SessionArtifactRecord } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { buildObservabilityTrace } from '../../src/observability/build';

function userMessage(id: string, text: string): Message {
  return {
    id,
    role: 'user',
    parts: [{ id: `${id}_p0`, type: 'text', text }],
  } as unknown as Message;
}

function toolCallMessage(
  id: string,
  agentId: string,
  toolName: string,
  input: Record<string, unknown>,
): Message {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        id: `${id}_call`,
        type: 'tool_call',
        agent_id: agentId,
        call_id: `${id}_call_id`,
        tool_name: toolName,
        input,
      },
    ],
  } as unknown as Message;
}

function handoffMessage(id: string, childAgent: string, runLabel: string): Message {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        id: `${id}_p0`,
        type: 'expert_handoff',
        stage: 'delegate.started',
        child_agent: childAgent,
        run_label: runLabel,
        parent_agent: 'main',
      },
    ],
  } as unknown as Message;
}

function handoffCompletedMessage(id: string, childAgent: string, runLabel: string): Message {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        id: `${id}_p0`,
        type: 'expert_handoff',
        stage: 'delegate.completed',
        child_agent: childAgent,
        run_label: runLabel,
        parent_agent: 'main',
      },
    ],
  } as unknown as Message;
}

function backgroundExitMessage(id: string, runLabel: string, status = 'completed'): Message {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        id: `${id}_p0`,
        type: 'background_exit',
        run_label: runLabel,
        exit_status: status,
      },
    ],
  } as unknown as Message;
}

const NO_ARTIFACTS: SessionArtifactRecord[] = [];

describe('buildObservabilityTrace — user turn row', () => {
  it('renders the opening user message as a "user" kind row with a message-jump nav', () => {
    const trace = buildObservabilityTrace({
      messages: [userMessage('msg_u1', 'What recent ground-motion is EarthScope showing?')],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    expect(trace.timeline).toHaveLength(1);
    const row = trace.timeline[0]!;
    expect(row.kind).toBe('user');
    expect(row.actor).toBe('user');
    expect(row.action).toContain('What recent ground-motion');
    expect(row.nav).toEqual({ kind: 'message', targetId: 'msg_u1' });
  });

  it('truncates a long question with an ellipsis, quoted', () => {
    const longText = 'x'.repeat(200);
    const trace = buildObservabilityTrace({
      messages: [userMessage('msg_u1', longText)],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const row = trace.timeline[0]!;
    expect(row.action.startsWith('"')).toBe(true);
    expect(row.action.endsWith('…"')).toBe(true);
    expect(row.action.length).toBeLessThan(longText.length);
  });

  it('never fabricates a row for an empty/redacted user text part', () => {
    const trace = buildObservabilityTrace({
      messages: [userMessage('msg_u1', '')],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    expect(trace.timeline).toHaveLength(0);
  });
});

describe('buildObservabilityTrace — agent nav (open agent)', () => {
  it('attaches an "agent" nav to an expert_handoff row when a real agent-task names this actor', () => {
    const task: SessionAgentTask = {
      task_id: 'task_1',
      status: 'completed',
      run_label: 'geospatial #1',
      child_session_id: 'sess_child_1',
      agent_ref: { expert_id: 'geospatial', requesting_expert_id: 'main' },
    } as unknown as SessionAgentTask;
    const trace = buildObservabilityTrace({
      messages: [handoffMessage('msg_a1', 'geospatial', 'geospatial #1')],
      agentTasks: [task],
      artifacts: NO_ARTIFACTS,
    });
    // expert_handoff's actor prefers child_agent ('geospatial') over run_label.
    const row = trace.timeline.find((r) => r.actor === 'geospatial');
    expect(row?.nav).toEqual({ kind: 'agent', targetId: 'sess_child_1' });
  });

  it('never fabricates an agent nav when no agent-task names the actor', () => {
    const trace = buildObservabilityTrace({
      messages: [handoffMessage('msg_a1', 'geospatial', 'geospatial #1')],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const row = trace.timeline[0]!;
    expect(row.nav).toBeUndefined();
  });
});

describe('buildObservabilityTrace — timeline thread depth/branch (P5 grind, PASS 2)', () => {
  it('opens at the parent depth, threads a child tool call one level deeper, and closes back at the parent depth', () => {
    const trace = buildObservabilityTrace({
      messages: [
        handoffMessage('m1', 'geospatial', 'geospatial #1'),
        toolCallMessage('m2', 'geospatial', 'geo_geocode', { region: 'LA' }),
        handoffCompletedMessage('m3', 'geospatial', 'geospatial #1'),
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const [started, toolCall, returned] = trace.timeline;
    expect(started!.depth).toBe(0);
    expect(started!.branch).toBe('open');
    expect(toolCall!.depth).toBe(1);
    expect(toolCall!.branch).toBeUndefined();
    expect(returned!.depth).toBe(0);
    expect(returned!.branch).toBe('close');
  });

  it('threads two nesting levels deep (task started by data, sub-task spawned by data, its own tool call)', () => {
    const trace = buildObservabilityTrace({
      messages: [
        handoffMessage('m1', 'data', 'data #1'),
        handoffMessage('m2', 'ndp_dataset_discovery', 'ndp_dataset_discovery #1'),
        toolCallMessage('m3', 'ndp_dataset_discovery', 'ndp_search', { q: 'stations' }),
        handoffCompletedMessage('m4', 'ndp_dataset_discovery', 'ndp_dataset_discovery #1'),
        handoffCompletedMessage('m5', 'data', 'data #1'),
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const depths = trace.timeline.map((row) => [row.depth, row.branch]);
    expect(depths).toEqual([
      [0, 'open'], // data: task started
      [1, 'open'], // ndp_dataset_discovery: spawned by data
      [2, undefined], // ndp_search: tool call
      [1, 'close'], // ndp_dataset_discovery: returned to data
      [0, 'close'], // data: returned to main
    ]);
  });

  it('lane-allocates two concurrently-open siblings (LIFO close order) without collapsing their depths', () => {
    // analysis opens; while it is still open, gnss opens, then station opens
    // (station is now the innermost); station closes first (matches its own
    // open order), then gnss, then analysis — mirrors the prototype's own
    // "spawned in parallel" demo rows (~8330210).
    const trace = buildObservabilityTrace({
      messages: [
        handoffMessage('m1', 'analysis', 'analysis #1'),
        handoffMessage('m2', 'gnss_timeseries_analysis', 'gnss #1'),
        handoffMessage('m3', 'station_network_analysis', 'station #1'),
        toolCallMessage('m4', 'station_network_analysis', 'station_metadata', {}),
        handoffCompletedMessage('m5', 'station_network_analysis', 'station #1'),
        toolCallMessage('m6', 'gnss_timeseries_analysis', 'csv_profile', {}),
        handoffCompletedMessage('m7', 'gnss_timeseries_analysis', 'gnss #1'),
        handoffCompletedMessage('m8', 'analysis', 'analysis #1'),
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const depths = trace.timeline.map((row) => [row.depth, row.branch]);
    expect(depths).toEqual([
      [0, 'open'], // analysis: task started
      [1, 'open'], // gnss: spawned in parallel
      [2, 'open'], // station: spawned in parallel (gnss still open)
      [3, undefined], // station_metadata: tool call
      [2, 'close'], // station: returned to analysis
      [2, undefined], // csv_profile: tool call (belongs to gnss, still open)
      [1, 'close'], // gnss: returned to analysis
      [0, 'close'], // analysis: returned to main
    ]);
  });

  it('closes an open branch via background_exit (not just delegate.completed)', () => {
    const trace = buildObservabilityTrace({
      messages: [
        handoffMessage('m1', 'io-monitor', 'io-monitor #1'),
        toolCallMessage('m2', 'io-monitor', 'sample', {}),
        backgroundExitMessage('m3', 'io-monitor #1'),
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const depths = trace.timeline.map((row) => [row.depth, row.branch]);
    expect(depths).toEqual([
      [0, 'open'],
      [1, undefined],
      [0, 'close'],
    ]);
  });

  it('never marks a branch close when no matching open exists (history starting mid-task)', () => {
    const trace = buildObservabilityTrace({
      messages: [handoffCompletedMessage('m1', 'geospatial', 'geospatial #1')],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    const row = trace.timeline[0]!;
    expect(row.depth).toBe(0);
    expect(row.branch).toBeUndefined();
  });
});

describe('buildObservabilityTrace — tool call log', () => {
  it('builds one chronological row per real tool_call part, not a server catalog', () => {
    const trace = buildObservabilityTrace({
      messages: [
        toolCallMessage('msg_t1', 'geospatial', 'geo_geocode', { region: 'Los Angeles' }),
      ],
      agentTasks: [],
      artifacts: NO_ARTIFACTS,
    });
    expect(trace.toolCalls).toHaveLength(1);
    const row = trace.toolCalls[0]!;
    expect(row.name).toBe('geo_geocode');
    expect(row.agent).toBe('geospatial');
    expect(row.argHint).toBe('region=Los Angeles');
    // No result part means the call is still running.
    expect(row.state).toBe('running');
    // A real, real message-jump — the wire's own call site, not a fabricated
    // "open the session where the call ran" (calls live in THIS session).
    expect(row.nav).toEqual({ kind: 'message', targetId: 'msg_t1' });
  });

  it('marks a call failed only when its matched tool_result says so', () => {
    const messages: Message[] = [
      toolCallMessage('msg_t1', 'geospatial', 'geo_geocode', { region: 'LA' }),
      {
        id: 'msg_t2',
        role: 'assistant',
        parts: [
          {
            id: 'msg_t2_p0',
            type: 'tool_result',
            call_id: 'msg_t1_call_id',
            is_error: true,
          },
        ],
      } as unknown as Message,
    ];
    const trace = buildObservabilityTrace({ messages, agentTasks: [], artifacts: NO_ARTIFACTS });
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.state).toBe('failed');
  });
});
