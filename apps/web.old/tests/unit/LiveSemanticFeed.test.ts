import type { SemanticEventPayload } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  appendUniqueSemanticEvent,
  applySemanticFeedEvent,
} from '../../src/LiveSemanticFeed.js';
import type { ExecutionTranscriptEvent } from '../../src/live.js';

function event(id: string): SemanticEventPayload {
  return {
    schema_version: 'clio.semantic_event.v1',
    event_id: id,
    event_type: 'react.step.completed',
    status: 'running',
    occurred_at: '2026-06-20T12:00:00Z',
  };
}

describe('LiveSemanticFeed', () => {
  it('appends unique events and enforces the cap', () => {
    const prev = [event('ev_1'), event('ev_2')];

    expect(appendUniqueSemanticEvent(prev, event('ev_2'), 2)).toBe(prev);
    expect(appendUniqueSemanticEvent(prev, event('ev_3'), 2).map((e) => e.event_id)).toEqual([
      'ev_2',
      'ev_3',
    ]);
  });

  it('updates semantic and execution feeds for semantic.event', () => {
    let semantic: SemanticEventPayload[] = [];
    let execution: ExecutionTranscriptEvent[] = [];
    const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
      typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;

    expect(
      applySemanticFeedEvent('semantic.event', event('ev_1') as unknown as Record<string, unknown>, {
        semanticFeedCap: 5,
        setSemanticEvents: (next) => {
          semantic = apply(semantic, next);
        },
        setExecutionEvents: (next) => {
          execution = apply(execution, next);
        },
      }),
    ).toBe(true);

    expect(semantic.map((e) => e.event_id)).toEqual(['ev_1']);
    expect(execution).toHaveLength(1);
    expect(execution[0]?.type).toBe('react.step.completed');
  });

  it('returns false for non-semantic events', () => {
    expect(applySemanticFeedEvent('message.completed', {}, {})).toBe(false);
  });
});
