import type { WorkspaceReference } from '@clio/core/v3';
import { MessageSquareTextIcon } from 'lucide-react';
import {
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
} from '@/components/ai-elements/attachments';
import type { CommentReview } from '@/lib/comment-review-reference';
import type { ContextReferenceBlock } from '@/lib/sent-inline-references';
import { revealCommentThreads } from './comments/comment-thread-reveal';
import { FileTypeIcon } from './file-type-icon';

function commentCount(count: number) {
  return `${count} ${count === 1 ? 'comment' : 'comments'}`;
}

/**
 * The file version a sent message commented on. Opening it shows that version with its
 * comment threads; hovering names the version and the comments.
 */
export function CommentReviewChip({
  block,
  review,
  onOpenReference,
}: {
  block: ContextReferenceBlock;
  review: CommentReview;
  onOpenReference?: (reference: WorkspaceReference) => void;
}) {
  const count = review.threads.length;
  const version = review.version ? `version ${review.version}` : undefined;
  const open = () => {
    if (!onOpenReference) return;
    revealCommentThreads(review.threads);
    onOpenReference({
      kind: block.ref_kind,
      id: block.ref_id,
      label: block.label,
      detail: '',
      media_type: block.media_type,
      revision: block.revision,
      navigation: block.navigation,
    });
  };
  return (
    <AttachmentHoverCard closeDelay={100} openDelay={220}>
      <AttachmentHoverCardTrigger asChild>
        <button
          aria-label={`Open ${block.label}${version ? ` ${version}` : ''} with ${commentCount(count)}`}
          className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-[7px] bg-hover px-2 text-ui text-foreground outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          data-reference-revision={block.revision}
          data-slot="comment-review-chip"
          disabled={!onOpenReference}
          onClick={open}
          type="button"
        >
          <FileTypeIcon className="size-3.5 shrink-0" mediaType={block.media_type} name={block.label} />
          <span className="min-w-0 truncate" data-truncation-hint="off">
            {block.label}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-label text-muted-foreground">
            <MessageSquareTextIcon aria-hidden="true" className="size-3" />
            {count}
          </span>
        </button>
      </AttachmentHoverCardTrigger>
      <AttachmentHoverCardContent className="max-w-72 border bg-popover p-3 shadow-md">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{block.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[version ? `Version ${review.version}` : undefined, commentCount(count)]
            .filter(Boolean)
            .join(', ')}
        </p>
        {review.labels.length ? (
          <p className="mt-2 text-xs">{review.labels.join(', ')}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">Opens this version with its comments.</p>
      </AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
}
