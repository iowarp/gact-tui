import type { AttentionAvailable, Message as DomainMessage } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { attentionMinimapMarks } from './attention-minimap-marks';

function message(id: string): DomainMessage {
  return {
    id,
    session_id: 's',
    role: 'assistant',
    created_at: '2026-09-27T00:00:00Z',
    blocks: [],
  } as unknown as DomainMessage;
}

function payload(blocks: AttentionAvailable['blocks']): AttentionAvailable {
  return {
    available: true,
    message_id: 'msg_2',
    selection: { text: 'x' },
    residual: 0.5,
    sources: [],
    flags: [],
    blocks,
  };
}

describe('attentionMinimapMarks', () => {
  const messages = [message('msg_0'), message('msg_1'), message('msg_2')];

  it('is empty without data', () => {
    expect(attentionMinimapMarks(undefined, messages)).toEqual([]);
  });

  it('sums share per message and orders marks by transcript position', () => {
    const marks = attentionMinimapMarks(
      payload([
        { message_id: 'msg_2', part_id: 'a', field: 'text', kind: 'assistant_text', share: 0.1, mean: 0, runs: [] },
        { message_id: 'msg_0', part_id: 'u', field: 'text', kind: 'user_text', share: 0.02, mean: 0, runs: [] },
        { message_id: 'msg_0', part_id: 'u', field: 'text', kind: 'user_text', share: 0.03, mean: 0, runs: [] },
      ]),
      messages,
    );
    expect(marks.map((mark) => mark.messageId)).toEqual(['msg_0', 'msg_2']);
    const first = marks[0];
    expect(first?.totalShare).toBeCloseTo(0.05, 5);
    expect(first?.blockCount).toBe(2);
    expect(first?.messageIndex).toBe(0);
  });

  it('buckets the heaviest message into the top bucket', () => {
    const marks = attentionMinimapMarks(
      payload([
        { message_id: 'msg_0', part_id: 'u', field: 'text', kind: 'user_text', share: 0.01, mean: 0, runs: [] },
        { message_id: 'msg_1', part_id: 'a', field: 'text', kind: 'assistant_text', share: 0.5, mean: 0, runs: [] },
      ]),
      messages,
      4,
    );
    const heaviest = marks.find((mark) => mark.messageId === 'msg_1');
    expect(heaviest?.bucket).toBe(3);
  });

  it('ignores blocks for a message not present in the transcript', () => {
    const marks = attentionMinimapMarks(
      payload([{ message_id: 'msg_missing', part_id: 'u', field: 'text', kind: 'user_text', share: 0.1, mean: 0, runs: [] }]),
      messages,
    );
    expect(marks).toEqual([]);
  });

  it('states each message as a share of the attention on the conversation, and greys tiny ones', () => {
    const marks = attentionMinimapMarks(
      payload([
        { message_id: 'msg_0', part_id: 'u', field: 'text', kind: 'user_text', share: 0.001, mean: 0, runs: [] },
        { message_id: 'msg_1', part_id: 'a', field: 'text', kind: 'assistant_text', share: 0.145, mean: 0, runs: [] },
        { message_id: 'msg_2', part_id: 'a', field: 'text', kind: 'assistant_text', share: 0.09, mean: 0, runs: [] },
      ]),
      messages,
    );
    const total = marks.reduce((sum, mark) => sum + mark.conversationShare, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(marks[1]?.conversationShare).toBeCloseTo(0.145 / 0.236, 5);
    expect(marks[0]?.heated).toBe(false);
    expect(marks[1]?.heated).toBe(true);
  });
});
