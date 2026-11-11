import type { Message, Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { conversationPreview, previewText } from './conversation-preview-model';

const message = (id: string, role = 'assistant') =>
  ({ id, role, blocks: [{ type: 'text', text: id }] }) as Message;
const branch = {
  parent_session_id: 'root',
  metadata: {
    fork_origin: {
      session_id: 'root',
      message_id: 'copied2',
      message_count: 2,
      created_at: '2026-10-11',
    },
  },
} as unknown as Session;

describe('selected conversation preview', () => {
  it('uses the child saved boundary and shows a bounded actual continuation', () => {
    const history = conversationPreview(branch, [
      message('copied1', 'user'),
      message('copied2'),
      message('old1', 'user'),
      message('old2'),
      message('latest1', 'user'),
      message('latest2'),
    ]);
    expect(history.copied.map((item) => item.id)).toEqual(['copied1', 'copied2']);
    expect(history.continuation.map((item) => item.id)).toEqual(['latest1', 'latest2']);
    expect(history.boundaryRetained).toBe(true);
  });
  it('does not mark retained messages as copied if rewind removed the saved boundary', () => {
    const history = conversationPreview(branch, [message('new1', 'user'), message('new2')]);
    expect(history.copied).toEqual([]);
    expect(history.boundaryRetained).toBe(false);
    expect(history.continuation).toHaveLength(2);
  });
  it('treats a fork point older than the newest page as retained, not rewound', () => {
    const history = conversationPreview(branch, [message('new1', 'user'), message('new2')], true);
    expect(history.copied).toEqual([]);
    expect(history.boundaryRetained).toBe(true);
    expect(history.continuation).toHaveLength(2);
  });
  it('handles an empty fork and a regular root without inventing copied history', () => {
    const empty = conversationPreview(
      {
        ...branch,
        metadata: {
          fork_origin: {
            ...(branch.metadata!['fork_origin'] as object),
            message_id: '',
            message_count: 0,
          },
        },
      },
      [],
    );
    expect(empty.boundaryRetained).toBe(true);
    expect(empty.copied).toEqual([]);
    expect(conversationPreview({} as Session, [message('answer')]).origin).toBeUndefined();
  });
  it('includes visible text only, excluding reasoning and tool payloads', () => {
    const row = {
      blocks: [
        { type: 'text', text: 'Visible' },
        { type: 'reasoning', text: 'Internal' },
        { type: 'tool', text: 'Payload' },
      ],
    } as unknown as Message;
    expect(previewText(row)).toBe('Visible');
  });
});
