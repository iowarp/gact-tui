import type { MessageBlock } from '@clio/core/v3';
import type { ContextReferenceBlock } from './sent-inline-references';

/** The comment threads one sent message made on one file version. */
export interface CommentReview {
  threads: readonly string[];
  labels: readonly string[];
  version?: number;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * The review a reference carries when it names a commented file version (the service
 * projects each `artifact_review` part as an artifact reference whose navigation lists the
 * threads); `undefined` for any other reference.
 */
export function commentReview(block: ContextReferenceBlock): CommentReview | undefined {
  if (block.ref_kind !== 'artifact' || !Array.isArray(block.navigation.comment_threads))
    return undefined;
  const version = block.navigation.artifact_version;
  return {
    threads: strings(block.navigation.comment_threads).filter(Boolean),
    labels: strings(block.navigation.comment_labels).filter(Boolean),
    version: typeof version === 'number' ? version : undefined,
  };
}

/**
 * One reference per commented file version. A streamed message receives a block per
 * thread, so references to the same version fold into the first, keeping every thread.
 */
export function foldCommentReviews(blocks: readonly MessageBlock[]): MessageBlock[] {
  const folded: MessageBlock[] = [];
  const first = new Map<string, number>();
  for (const block of blocks) {
    const review = block.type === 'context_reference' ? commentReview(block) : undefined;
    if (block.type !== 'context_reference' || !review) {
      folded.push(block);
      continue;
    }
    const at = first.get(block.ref_id);
    const earlier = at === undefined ? undefined : folded[at];
    if (earlier?.type !== 'context_reference') {
      first.set(block.ref_id, folded.length);
      folded.push(block);
      continue;
    }
    const kept = commentReview(earlier);
    folded[at!] = {
      ...earlier,
      navigation: {
        ...earlier.navigation,
        comment_threads: [...new Set([...(kept?.threads ?? []), ...review.threads])],
        comment_labels: [...new Set([...(kept?.labels ?? []), ...review.labels])],
      },
    };
  }
  return folded;
}
