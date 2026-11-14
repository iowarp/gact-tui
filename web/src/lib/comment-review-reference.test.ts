import type { MessageBlock } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { commentReview, foldCommentReviews } from './comment-review-reference';

function review(id: string, refId: string, thread: string, label: string): MessageBlock {
  return {
    id,
    type: 'context_reference',
    ref_kind: 'artifact',
    ref_id: refId,
    label: 'validation.json',
    media_type: 'application/json',
    revision: 'sha',
    navigation: {
      comment_threads: [thread],
      comment_labels: [label],
      artifact_version: 1,
    },
  } as MessageBlock;
}

describe('comment review references', () => {
  it('folds the per-thread references of one version into the first', () => {
    const text = { id: 't', type: 'text', text: 'Comments' } as MessageBlock;
    const folded = foldCommentReviews([
      text,
      review('a', 'v1', 'th-1', 'S1'),
      review('b', 'v1', 'th-2', 'S2'),
      review('c', 'v2', 'th-3', 'S1'),
    ]);
    expect(folded.map((block) => block.id)).toEqual(['t', 'a', 'c']);
    const first = folded[1];
    if (first?.type !== 'context_reference') throw new Error('expected a reference');
    expect(commentReview(first)).toEqual({
      threads: ['th-1', 'th-2'],
      labels: ['S1', 'S2'],
      version: 1,
    });
  });

  it('leaves ordinary references alone', () => {
    const plain = {
      id: 'p',
      type: 'context_reference',
      ref_kind: 'artifact',
      ref_id: 'v1',
      label: 'validation.json',
      navigation: {},
    } as MessageBlock;
    if (plain.type !== 'context_reference') throw new Error('expected a reference');
    expect(commentReview(plain)).toBeUndefined();
    expect(foldCommentReviews([plain, review('a', 'v1', 'th-1', 'S1')])).toHaveLength(2);
  });
});
