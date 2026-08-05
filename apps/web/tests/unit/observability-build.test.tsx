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
