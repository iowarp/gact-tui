/**
 * 1.0 item 5 — Inspector execution timeline.
 *
 * assembleTimeline is a pure function over a Message's parts — these tests
 * pin its honest-representation rules: sequence from part order, durations
 * and timestamps only where the wire provides them.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InspectorDrawer,
  assembleTimeline,
} from '../../src/components/InspectorDrawer.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

const TOOL_TURN: Message = {
  id: 'a1',
  role: 'assistant',
  created_at: '2026-06-02T10:00:00Z',
  updated_at: '2026-06-02T10:00:12.400Z',
  stop_reason: 'end_turn',
  tokens: { input: 1200, output: 340 },
  cost_usd: 0.0123,
  parts: [
    {
      type: 'routing_decision',
      selected_agent: 'chat',
      rationale: 'Direct factual question',
      heuristic: false,
    },
    { type: 'thinking', text: 'consider the request carefully' },
    {
      type: 'tool_call',
      call_id: 'tc1',
      tool_name: 'ReadFile',
      input: { path: 'x.go' },
    },
    {
      type: 'tool_result',
      call_id: 'tc1',
      output: 'contents',
      duration_ms: 420,
    },
    {
      type: 'tool_call',
      call_id: 'tc2',
      tool_name: 'Grep',
      input: { pattern: 'foo' },
    },
    {
      type: 'tool_result',
      call_id: 'tc2',
      output: '',
      is_error: true,
      duration_ms: 1800,
    },
    { type: 'text', text: 'Here is the answer.' },
    { type: 'text', text: 'Continued.' },
  ],
} as Message;

describe('assembleTimeline (1.0 item 5)', () => {
  it('produces ordered events: started → routing → thinking → tools → text → completed', () => {
    const events = assembleTimeline(TOOL_TURN);
    expect(events.map((e) => e.kind)).toEqual([
      'started',
      'routing',
      'thinking',
      'tool',
      'tool',
      'text',
      'completed',
    ]);
  });

  it('pairs tool calls with results: status + measured duration', () => {
    const events = assembleTimeline(TOOL_TURN);
    const tools = events.filter((e) => e.kind === 'tool');
    expect(tools[0]).toMatchObject({
      label: 'ReadFile',
      status: 'ok',
      durationMs: 420,
    });
    expect(tools[1]).toMatchObject({
      label: 'Grep',
      status: 'error',
      durationMs: 1800,
    });
  });

  it('collapses multiple text parts into one response-text event', () => {
    const events = assembleTimeline(TOOL_TURN);
    expect(events.filter((e) => e.kind === 'text').length).toBe(1);
  });

  it('the completed event carries real tokens, cost, and elapsed time', () => {
    const events = assembleTimeline(TOOL_TURN);
    const done = events.find((e) => e.kind === 'completed')!;
    expect(done.status).toBe('ok');
    expect(done.detail).toContain('1200→340 tok');
    expect(done.detail).toContain('$0.0123');
    expect(done.detail).toContain('12.4s');
  });

  it('an in-flight turn (no stop_reason) has no completed event; unresolved tools are running', () => {
    const inflight: Message = {
      id: 'a2',
      role: 'assistant',
      parts: [
        { type: 'tool_call', call_id: 'x', tool_name: 'Bash', input: {} },
      ],
    } as Message;
    const events = assembleTimeline(inflight);
    expect(events.find((e) => e.kind === 'completed')).toBeUndefined();
    expect(events.find((e) => e.kind === 'tool')).toMatchObject({
      status: 'running',
    });
  });

  it('a failed turn ends with an error completed event', () => {
    const failed: Message = {
      ...TOOL_TURN,
      stop_reason: 'error',
    } as Message;
    const done = assembleTimeline(failed).find((e) => e.kind === 'completed')!;
    expect(done.status).toBe('error');
    expect(done.label).toBe('Turn failed');
  });
});

describe('Inspector Timeline tab (1.0 item 5)', () => {
  it('renders the Timeline tab and its events for a message with parts', () => {
    render(() => (
      <InspectorDrawer
        open={true}
        message={TOOL_TURN}
        toolCalls={[]}
        costUsd={0}
        onClose={() => undefined}
      />
    ));
    const tab = screen.getByTestId('inspector-tab-timeline');
    tab.click();
    expect(screen.getByTestId('inspector-timeline')).toBeTruthy();
    // The two tool events render with their names + durations.
    expect(screen.getByText('ReadFile')).toBeTruthy();
    expect(screen.getByText('Grep')).toBeTruthy();
    expect(screen.getByText('420ms')).toBeTruthy();
    expect(screen.getByText('1.8s')).toBeTruthy();
  });
});
