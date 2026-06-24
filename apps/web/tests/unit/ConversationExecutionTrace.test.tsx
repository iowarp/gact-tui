import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { SemanticEventPayload } from '@clio/core';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

/**
 * v0.2 inline execution trace: the semantic spine (agent invocations, expert
 * handoffs, tool timings, memory access) is surfaced INLINE in the main
 * conversation under each assistant turn, not only in the Inspector. These
 * guard that the per-turn strip renders the rows + durations, drops redaction
 * sentinels, and stays absent when no spine is present (additive).
 */
describe('conversation execution trace', () => {
  function renderWith(events: SemanticEventPayload[] | undefined) {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          { id: 'turn-1', role: 'user', parts: [{ type: 'text', text: 'plot the data' }] },
          {
            id: 'm-asst',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Done.' }],
          },
        ]}
        semanticEvents={events}
      />
    ));
  }

  const ev = (p: Partial<SemanticEventPayload>): SemanticEventPayload =>
    ({ event_id: Math.random().toString(36), event_type: 'tool.call.completed', turn_id: 'turn-1', ...p }) as SemanticEventPayload;

  it('renders an inline execution-trace strip keyed to the turn', () => {
    renderWith([
      ev({
        event_id: 's-handoff',
        event_type: 'blueprint.delegation.started',
        occurred_at: '2026-06-23T10:00:00Z',
        actor: { agent_id: 'main' },
        subject: { agent_id: 'data' },
      }),
      ev({
        event_id: 's-tool',
        event_type: 'tool.call.completed',
        occurred_at: '2026-06-23T10:00:01Z',
        actor: { agent_id: 'data', tool: 'sac_read' },
        payload: { tool: 'sac_read', duration_ms: 812.4 },
      }),
    ]);
    const trace = screen.getByTestId('conversation-execution-trace');
    expect(within(trace).getByText('main → data')).toBeTruthy();
    expect(within(trace).getByText('sac_read')).toBeTruthy();
    // 812.4ms rounds to a sub-second ms reading.
    expect(within(trace).getByText('812ms')).toBeTruthy();
  });

  it('formats a multi-second duration as seconds', () => {
    renderWith([
      ev({
        event_id: 's-agent',
        event_type: 'agent.invocation.completed',
        summary: 'main returned a prediction',
        actor: { agent_id: 'main' },
        payload: { duration_ms: 4200 },
      }),
    ]);
    const trace = screen.getByTestId('conversation-execution-trace');
    expect(within(trace).getByText('4.2s')).toBeTruthy();
  });

  it('never renders a redaction sentinel as content', () => {
    renderWith([
      ev({
        event_id: 's-redacted',
        event_type: 'tool.call.completed',
        summary: '[redacted]:42 chars',
        actor: { agent_id: 'data', tool: '[redacted]:9 chars' },
        payload: { tool: '[redacted]:9 chars', duration_ms: 5 },
      }),
    ]);
    expect(screen.queryByText(/\[redacted\]/)).toBeNull();
  });

  it('renders no strip when the spine is absent (additive)', () => {
    renderWith(undefined);
    expect(screen.queryByTestId('conversation-execution-trace')).toBeNull();
  });
});
