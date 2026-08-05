import type { Message, SessionAgentTask, SessionMessageEvent } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  applyChildPreviewEvent,
  CHILD_PREVIEW_TAIL_CHARS,
  EMPTY_CHILD_PREVIEW,
  findAgentTaskByHandle,
  selectRunningHandoffHandles,
  selectSubscriptionSlots,
  type ChildPreviewAccumulator,
} from '../../src/session/childPreview';

function evt(
  type: SessionMessageEvent['type'],
  payload: Record<string, unknown>,
): Pick<SessionMessageEvent, 'type' | 'payload'> {
  return { type, payload };
}

describe('applyChildPreviewEvent (pure reducer over the child session wire)', () => {
  it('starts tracking a fresh text part on message.part.added', () => {
    const next = applyChildPreviewEvent(
      EMPTY_CHILD_PREVIEW,
      evt('message.part.added', { part: { id: 'p1', type: 'text', text: 'Hello' } }),
    );
    expect(next).toEqual({ partId: 'p1', text: 'Hello' });
  });

  it('appends a matching text_append delta to the tracked part', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'Hello' };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.delta', { part_id: 'p1', delta: { text_append: ', world' } }),
    );
    expect(next).toEqual({ partId: 'p1', text: 'Hello, world' });
  });

  it('ignores a delta for a part id that is not the one being tracked', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'Hello' };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.delta', { part_id: 'other', delta: { text_append: 'nope' } }),
    );
    expect(next).toBe(started);
  });

  it('ignores a delta before any part has been tracked', () => {
    const next = applyChildPreviewEvent(
      EMPTY_CHILD_PREVIEW,
      evt('message.part.delta', { part_id: 'p1', delta: { text_append: 'nope' } }),
    );
    expect(next).toBe(EMPTY_CHILD_PREVIEW);
  });

  it('ignores a non-text part.added — thinking/tool parts never feed the preview', () => {
    const next = applyChildPreviewEvent(
      EMPTY_CHILD_PREVIEW,
      evt('message.part.added', { part: { id: 'p1', type: 'thinking', thinking: 'pondering' } }),
    );
    expect(next).toBe(EMPTY_CHILD_PREVIEW);
  });

  it('a fresh text part.added SWITCHES tracking away from a stale one', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'old prose' };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.added', { part: { id: 'p2', type: 'text', text: 'new step' } }),
    );
    expect(next).toEqual({ partId: 'p2', text: 'new step' });
  });

  it('message.part.updated is treated the same as added (upsert-by-id idiom)', () => {
    const next = applyChildPreviewEvent(
      EMPTY_CHILD_PREVIEW,
      evt('message.part.updated', { part: { id: 'p1', type: 'text', text: 'settled text' } }),
    );
    expect(next).toEqual({ partId: 'p1', text: 'settled text' });
  });

  it('message.part.completed replaces the tracked text with final_text', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'partial' };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.completed', { part_id: 'p1', final_text: 'the whole thing' }),
    );
    expect(next).toEqual({ partId: 'p1', text: 'the whole thing' });
  });

  it('caps the rolling tail at CHILD_PREVIEW_TAIL_CHARS, keeping the END of the text', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'a'.repeat(CHILD_PREVIEW_TAIL_CHARS) };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.delta', { part_id: 'p1', delta: { text_append: 'TAIL' } }),
    );
    expect(next.text).toHaveLength(CHILD_PREVIEW_TAIL_CHARS);
    expect(next.text.endsWith('TAIL')).toBe(true);
  });

  it('is a no-op for lifecycle events outside the tracked vocabulary', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'steady' };
    const next = applyChildPreviewEvent(started, evt('message.completed', {}));
    expect(next).toBe(started);
  });

  it('ignores an empty text_append (never rewrites state for a no-op wire event)', () => {
    const started: ChildPreviewAccumulator = { partId: 'p1', text: 'steady' };
    const next = applyChildPreviewEvent(
      started,
      evt('message.part.delta', { part_id: 'p1', delta: { text_append: '' } }),
    );
    expect(next).toBe(started);
  });
});

function handoffPart(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'expert_handoff',
    stage: 'delegate.started',
    handle_id: 'task_1',
    ...overrides,
  };
}

function msg(id: string, parts: unknown[]): Message {
  return { id, role: 'assistant', parts: parts as Message['parts'] };
}

describe('selectRunningHandoffHandles', () => {
  it('returns handle ids of expert_handoff parts still at stage delegate.started', () => {
    const handles = selectRunningHandoffHandles([
      msg('m1', [handoffPart({ handle_id: 'task_1' })]),
    ]);
    expect(handles).toEqual(['task_1']);
  });

  it('excludes a settled handoff (any stage other than delegate.started)', () => {
    const handles = selectRunningHandoffHandles([
      msg('m1', [handoffPart({ handle_id: 'task_1', stage: 'delegate.completed' })]),
    ]);
    expect(handles).toEqual([]);
  });

  it('excludes a failed handoff', () => {
    const handles = selectRunningHandoffHandles([
      msg('m1', [handoffPart({ handle_id: 'task_1', stage: 'delegate.failed' })]),
    ]);
    expect(handles).toEqual([]);
  });

  it('ignores non-handoff parts and handoffs with no handle_id', () => {
    const handles = selectRunningHandoffHandles([
      msg('m1', [{ type: 'text', text: 'hi' }, handoffPart({ handle_id: '' })]),
    ]);
    expect(handles).toEqual([]);
  });

  it('collects across multiple messages, in order, deduped', () => {
    const handles = selectRunningHandoffHandles([
      msg('m1', [handoffPart({ handle_id: 'task_1' })]),
      msg('m2', [handoffPart({ handle_id: 'task_2' }), handoffPart({ handle_id: 'task_1' })]),
    ]);
    expect(handles).toEqual(['task_1', 'task_2']);
  });
});

describe('findAgentTaskByHandle', () => {
  it('matches on task_id', () => {
    const tasks: SessionAgentTask[] = [{ task_id: 'task_1', status: 'running' }];
    expect(findAgentTaskByHandle(tasks, 'task_1')).toBe(tasks[0]);
  });

  it('falls back to the legacy `id` alias', () => {
    const tasks: SessionAgentTask[] = [{ task_id: '', id: 'task_1', status: 'running' }];
    expect(findAgentTaskByHandle(tasks, 'task_1')).toBe(tasks[0]);
  });

  it('returns undefined when no row matches', () => {
    const tasks: SessionAgentTask[] = [{ task_id: 'task_2', status: 'running' }];
    expect(findAgentTaskByHandle(tasks, 'task_1')).toBeUndefined();
  });
});

describe('selectSubscriptionSlots (concurrency cap)', () => {
  it('opens all running handles when under the cap', () => {
    const slots = selectSubscriptionSlots(['a', 'b'], new Set(), 4);
    expect(slots).toEqual(['a', 'b']);
  });

  it('never re-opens an already-open handle', () => {
    const slots = selectSubscriptionSlots(['a', 'b'], new Set(['a']), 4);
    expect(slots).toEqual(['b']);
  });

  it('stops at the cap, leaving the rest unopened', () => {
    const slots = selectSubscriptionSlots(['a', 'b', 'c', 'd', 'e'], new Set(), 4);
    expect(slots).toEqual(['a', 'b', 'c', 'd']);
  });

  it('accounts for already-open handles against the cap', () => {
    const slots = selectSubscriptionSlots(['a', 'b', 'c'], new Set(['x', 'y', 'z']), 4);
    expect(slots).toEqual(['a']);
  });

  it('opens nothing once the cap is already met', () => {
    const slots = selectSubscriptionSlots(['a', 'b'], new Set(['w', 'x', 'y', 'z']), 4);
    expect(slots).toEqual([]);
  });
});
