import type { SemanticEventPayload } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { groupSemanticEvents } from '../../src/components/InspectorSemanticTimelineModel.js';

describe('InspectorSemanticTimelineModel', () => {
  it('groups rows by turn and sorts rows by occurred_at', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'late',
        event_type: 'turn.completed',
        turn_id: 'turn-1',
        status: 'completed',
        summary: 'done',
        occurred_at: '2026-06-02T10:00:02Z',
      },
      {
        event_id: 'early',
        event_type: 'turn.started',
        turn_id: 'turn-1',
        status: 'started',
        summary: 'started',
        occurred_at: '2026-06-02T10:00:01Z',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.turnId).toBe('turn-1');
    expect(groups[0]!.rows.map((row) => row.eventId)).toEqual(['early', 'late']);
  });

  it('drops semantic events already represented by part-derived rows', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'tool',
        event_type: 'tool.call.started',
        turn_id: 'turn-1',
        status: 'started',
      },
      {
        event_id: 'subagent',
        event_type: 'subagent.started',
        turn_id: 'turn-1',
        status: 'started',
      },
      {
        event_id: 'kept',
        event_type: 'turn.started',
        turn_id: 'turn-1',
        status: 'started',
      },
    ]);
    expect(groups[0]!.rows.map((row) => row.eventId)).toEqual(['kept']);
  });

  it('maps status and invalid tool selection labels', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'running',
        event_type: 'turn.started',
        turn_id: 'turn-1',
        status: 'running',
      },
      {
        event_id: 'blocked',
        event_type: 'turn.blocked',
        turn_id: 'turn-1',
        status: 'blocked',
      },
      {
        event_id: 'invalid',
        event_type: 'tool.selection.invalid',
        turn_id: 'turn-1',
        status: 'completed',
        summary: 'raw summary should not win',
      },
    ]);
    const rows = new Map(groups[0]!.rows.map((row) => [row.eventId, row]));
    expect(rows.get('running')?.status).toBe('running');
    expect(rows.get('blocked')?.status).toBe('error');
    expect(rows.get('invalid')).toMatchObject({
      label: 'Invalid tool selection',
      status: 'error',
    });
  });

  it('sorts turn groups newest first and keeps no-turn events grouped', () => {
    const groups = groupSemanticEvents([
      {
        event_id: 'old',
        event_type: 'turn.completed',
        turn_id: 'old-turn',
        status: 'completed',
        occurred_at: '2026-06-02T09:00:00Z',
      },
      {
        event_id: 'new',
        event_type: 'turn.completed',
        turn_id: 'new-turn',
        status: 'completed',
        occurred_at: '2026-06-02T11:00:00Z',
      },
      {
        event_id: 'unscoped',
        event_type: 'turn.completed',
        status: 'completed',
      } as SemanticEventPayload,
    ]);
    expect(groups.map((group) => group.turnId)).toEqual(['new-turn', 'old-turn', '(no turn)']);
  });
});
