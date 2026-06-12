/**
 * A6 — Inspector semantic timeline renders clio's invalid-tool-selection
 * event with a clear label + error status dot, and never drops it.
 *
 * The exact event_type could not be observed live (the verification clio
 * had no agent wired), so the handler matches the documented
 * `tool.selection.invalid` event_type and, defensively, the
 * `tool.selection.` prefix.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InspectorDrawer,
  groupSemanticEvents,
} from '../../src/components/InspectorDrawer.js';
import type { Message, SemanticEventPayload } from '@clio/core';

afterEach(cleanup);

const MSG: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'answer' }],
} as Message;

const FEED: SemanticEventPayload[] = [
  {
    event_id: 'ev_start',
    event_type: 'turn.started',
    turn_id: 'usr_1',
    status: 'started',
    summary: 'Turn started',
    occurred_at: '2026-06-02T10:00:00.000Z',
  },
  {
    event_id: 'ev_invalid',
    event_type: 'tool.selection.invalid',
    turn_id: 'usr_1',
    // Note: no explicit failed/blocked status — the renderer must still
    // light the error dot for this event type.
    summary: 'Model selected an unavailable tool',
    occurred_at: '2026-06-02T10:00:01.000Z',
  },
];

describe('groupSemanticEvents — invalid tool selection (A6)', () => {
  it('keeps the event (not filtered as a duplicate) and labels it', () => {
    const groups = groupSemanticEvents(FEED);
    expect(groups).toHaveLength(1);
    const row = groups[0]!.rows.find((r) => r.eventId === 'ev_invalid');
    expect(row).toBeTruthy();
    expect(row!.label).toBe('Invalid tool selection');
  });

  it('marks it as an error even without a failed/blocked status', () => {
    const groups = groupSemanticEvents(FEED);
    const row = groups[0]!.rows.find((r) => r.eventId === 'ev_invalid');
    expect(row!.status).toBe('error');
  });

  it('also handles a prefixed variant defensively', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'ev_variant',
        event_type: 'tool.selection.invalid_name',
        turn_id: 't',
        summary: 'bad tool',
      },
    ]);
    const row = groups[0]!.rows.find((r) => r.eventId === 'ev_variant');
    expect(row!.label).toBe('Invalid tool selection');
    expect(row!.status).toBe('error');
  });
});

describe('Inspector renders the invalid-tool-selection row (A6)', () => {
  it('renders the row with an error-status class when capability is on', () => {
    render(() => (
      <InspectorDrawer
        open={true}
        message={MSG}
        toolCalls={[]}
        costUsd={0}
        semanticEvents={FEED}
        semanticEventsEnabled={true}
        onClose={() => undefined}
      />
    ));
    screen.getByTestId('inspector-tab-timeline').click();
    const el = screen.getByTestId('semantic-event-ev_invalid');
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-event-type')).toBe('tool.selection.invalid');
    expect(el.className).toContain('inspector__tl-event--error');
    expect(el.textContent).toContain('Invalid tool selection');
  });
});
