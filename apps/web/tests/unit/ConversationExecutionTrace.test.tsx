import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { SemanticEventPayload } from '@clio/core';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

/**
 * RENDERING_SPEC §9: the redundant inline "Execution trace" disclosure
 * (`conversation-execution-trace` / `cx-trace*`) has been REMOVED. The unified
 * live turn (`execution_tree` → buildTurnModelFromNodes → AssistantTurnView)
 * already shows the execution, so the separate strip is silly and must never
 * render. These guard that it stays gone and that a redaction sentinel never
 * leaks into the conversation regardless of the spine.
 */
describe('conversation execution trace (removed)', () => {
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

  it('never renders the redundant inline execution-trace strip', () => {
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
    expect(screen.queryByTestId('conversation-execution-trace')).toBeNull();
    // None of the old `cx-trace*` disclosure markup may survive.
    expect(document.querySelector('.cx-trace, .cx-trace__title')).toBeNull();
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

  it('renders no strip when the spine is absent', () => {
    renderWith(undefined);
    expect(screen.queryByTestId('conversation-execution-trace')).toBeNull();
  });
});
