import type { Message } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { placeDeliveredFeedback } from './conversation-feedback';
import { conversationTurnPresentation } from './conversation-turn-model';

const owner: Message = {
  id: 'answer',
  session_id: 's',
  role: 'assistant',
  created_at: '2026-10-10T01:12:00Z',
  blocks: [
    { id: 'first', type: 'text', text: 'First iteration.' },
    { id: 'next', type: 'text', text: 'Next iteration.' },
  ],
};
const feedback: Message = {
  id: 'feedback',
  session_id: 's',
  role: 'user',
  created_at: '2026-10-10T01:13:00Z',
  metadata: { steer_delivery: { assistant_message_id: 'answer', after_part_id: 'first' } },
  blocks: [{ id: 'feedback-text', type: 'text', text: 'Use the new scope.' }],
};

it('places a delivered message once between the iterations that consumed it', () => {
  const placed = placeDeliveredFeedback([owner, feedback]);
  expect(placed.messages).toEqual([owner]);
  expect(
    conversationTurnPresentation(owner, {}, {}, placed.feedback.get(owner.id)).segments,
  ).toEqual([
    { kind: 'block', block: owner.blocks[0] },
    { kind: 'feedback', message: feedback },
    { kind: 'block', block: owner.blocks[1] },
  ]);
});

it('keeps feedback visible until both its owner and exact recorded anchor are present', () => {
  expect(placeDeliveredFeedback([feedback]).messages).toEqual([feedback]);
  const missingAnchor = { ...owner, blocks: [owner.blocks[1]!] };
  expect(placeDeliveredFeedback([missingAnchor, feedback]).messages).toEqual([
    missingAnchor,
    feedback,
  ]);
});

it('preserves multiple feedback identities at the same boundary and after the last part', () => {
  const later = { ...feedback, id: 'later' };
  const last = {
    ...feedback,
    id: 'last',
    metadata: {
      steer_delivery: { assistant_message_id: 'answer', after_part_id: 'next' },
    },
  };
  const placed = placeDeliveredFeedback([owner, feedback, later, last]);
  const segments = conversationTurnPresentation(
    owner,
    {},
    {},
    placed.feedback.get(owner.id),
  ).segments;
  expect(
    segments.map((segment) => (segment.kind === 'feedback' ? segment.message.id : 'content')),
  ).toEqual(['content', 'feedback', 'later', 'content', 'last']);
});
