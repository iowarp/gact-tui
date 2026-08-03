/**
 * GAP 3 — Inspector semantic execution trace.
 *
 * The Timeline tab gains read-only rows from clio's `semantic.event`
 * stream, gated on the x_clio_semantic_events capability. These tests pin:
 *   - rows render from a turn lifecycle fixture,
 *   - rendering is gated on the capability flag,
 *   - redacted-sentinel dict values are never rendered as content,
 *   - event types already shown as part-derived rows (tool.call.*) are
 *     suppressed to avoid double display.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InspectorDrawer,
  groupSemanticEvents,
} from '../../src/components/InspectorDrawer.js';
import type { Message, SemanticEventPayload } from '@clio/core';

afterEach(cleanup);

const TURN: SemanticEventPayload[] = [
  {
    schema_version: 'clio.semantic_event.v1',
    event_id: 'ev_started',
    event_type: 'turn.started',
    turn_id: 'usr_1',
    status: 'started',
    summary: 'Turn started',
    occurred_at: '2026-06-02T10:00:00.000Z',
  },
  {
    event_id: 'ev_llm_req',
    event_type: 'llm.request.started',
    turn_id: 'usr_1',
    status: 'running',
    summary: 'LLM request started',
    // Redacted-sentinel values must never reach the DOM as content.
    provider: { api_key: '[redacted]:43 chars', model: '[redacted]:12 chars' },
    occurred_at: '2026-06-02T10:00:01.000Z',
  },
  {
    event_id: 'ev_llm_resp',
    event_type: 'llm.response.completed',
    turn_id: 'usr_1',
    status: 'completed',
    summary: 'LLM response completed',
    occurred_at: '2026-06-02T10:00:03.000Z',
  },
  {
    event_id: 'ev_done',
    event_type: 'turn.completed',
    turn_id: 'usr_1',
    status: 'completed',
    summary: 'Turn completed',
    occurred_at: '2026-06-02T10:00:04.000Z',
  },
  // A tool.call.* event — already shown as a part-derived timeline row,
  // so it must be suppressed in the semantic feed.
  {
    event_id: 'ev_tool',
    event_type: 'tool.call.started',
    turn_id: 'usr_1',
    status: 'started',
    summary: 'ReadFile started',
    occurred_at: '2026-06-02T10:00:02.000Z',
  },
];

const MSG: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'answer' }],
} as Message;

describe('groupSemanticEvents (GAP 3)', () => {
  it('orders rows within a turn by occurred_at and drops duplicate types', () => {
    const groups = groupSemanticEvents(TURN);
    expect(groups).toHaveLength(1);
    const labels = groups[0]!.rows.map((r) => r.eventType);
    // tool.call.started is suppressed; the rest are in occurred_at order.
    expect(labels).toEqual([
      'turn.started',
      'llm.request.started',
      'llm.response.completed',
      'turn.completed',
    ]);
  });

  it('maps statuses onto the tri-state dot', () => {
    const groups = groupSemanticEvents([
      { event_id: 'a', event_type: 'turn.started', status: 'started', turn_id: 't' },
      { event_id: 'b', event_type: 'turn.failed', status: 'failed', turn_id: 't' },
      { event_id: 'c', event_type: 'turn.completed', status: 'completed', turn_id: 't' },
    ]);
    const byId = new Map(groups[0]!.rows.map((r) => [r.eventId, r.status]));
    expect(byId.get('a')).toBe('running');
    expect(byId.get('b')).toBe('error');
    expect(byId.get('c')).toBe('ok');
  });

  it('groups newest turn first', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'old',
        event_type: 'turn.completed',
        turn_id: 'turn_old',
        status: 'completed',
        occurred_at: '2026-06-02T09:00:00Z',
      },
      {
        event_id: 'new',
        event_type: 'turn.completed',
        turn_id: 'turn_new',
        status: 'completed',
        occurred_at: '2026-06-02T11:00:00Z',
      },
    ]);
    expect(groups.map((g) => g.turnId)).toEqual(['turn_new', 'turn_old']);
  });
});

describe('Inspector semantic timeline rows (GAP 3)', () => {
  function renderWith(enabled: boolean) {
    return render(() => (
      <InspectorDrawer
        open={true}
        message={MSG}
        toolCalls={[]}
        costUsd={0}
        semanticEvents={TURN}
        semanticEventsEnabled={enabled}
        onClose={() => undefined}
      />
    ));
  }

  it('renders the semantic rows when the capability is advertised', () => {
    renderWith(true);
    screen.getByTestId('inspector-tab-timeline').click();
    expect(screen.getByTestId('inspector-semantic-title')).toBeTruthy();
    expect(screen.getByTestId('semantic-event-ev_started')).toBeTruthy();
    expect(screen.getByTestId('semantic-event-ev_llm_req')).toBeTruthy();
    expect(screen.getByTestId('semantic-event-ev_done')).toBeTruthy();
  });

  it('renders nothing semantic when the capability flag is absent', () => {
    renderWith(false);
    // The part-derived timeline still works; the semantic section does not.
    screen.getByTestId('inspector-tab-timeline').click();
    expect(screen.queryByTestId('inspector-semantic-title')).toBeNull();
    expect(screen.queryByTestId('semantic-event-ev_started')).toBeNull();
  });

  it('suppresses tool.call.* rows already covered by the part timeline', () => {
    renderWith(true);
    screen.getByTestId('inspector-tab-timeline').click();
    expect(screen.queryByTestId('semantic-event-ev_tool')).toBeNull();
  });

  it('never renders redacted-sentinel dict values as content', () => {
    const { container } = renderWith(true);
    screen.getByTestId('inspector-tab-timeline').click();
    // The provider dict carried "[redacted]:N chars" sentinels — only
    // id/status/summary/occurred_at are rendered, never the dicts.
    expect(container.textContent).not.toContain('[redacted]');
  });
});
