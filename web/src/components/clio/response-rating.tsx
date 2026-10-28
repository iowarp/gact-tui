import { useNearViewport } from '@/hooks/use-near-viewport';
import type { Message, RateResponseInput } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon, MessageSquareIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessageAction } from '@/components/ai-elements/message';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AddIcon } from '@/lib/icon-vocabulary';
import { ResponseFeedbackComment } from './response-feedback-comment';

/** A compact, durable response rating; archived and unfinished messages are read-only. */
export function ResponseRating({
  message,
  active = false,
}: {
  message: Message;
  active?: boolean;
}) {
  const { readOnly } = useConnectionSettings();
  if (
    readOnly ||
    active ||
    message.role !== 'assistant' ||
    !(message.completed_at || message.stop_reason)
  )
    return null;
  return <StoredResponseRating sessionId={message.session_id} messageId={message.id} />;
}

function StoredResponseRating({ sessionId, messageId }: { sessionId: string; messageId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const [commentOpen, setCommentOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const near = useNearViewport(triggerRef);
  const queryKey = ['response-feedback', connectionScope(settings), sessionId, messageId];
  const stored = useQuery({
    queryKey,
    enabled: near,
    queryFn: ({ signal }) => repository.responseFeedback(sessionId, messageId, signal),
    retry: false,
  });
  const save = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: (input: RateResponseInput) => repository.rateResponse(sessionId, messageId, input),
    onSuccess: (value, input) => {
      queryClient.setQueryData(queryKey, value);
      if (input.comment !== undefined) {
        setCommentOpen(false);
        toast.success('Feedback saved');
      } else toast.success(value.feedback?.rating ? 'Response rated' : 'Rating removed');
    },
    onError: () => {
      toast.error('Could not confirm your feedback. Please try again.');
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const rating = stored.data?.feedback?.rating;
  const comment = stored.data?.feedback?.comment ?? '';
  const busy = stored.isPending || save.isPending;
  const ratingLabel = save.isPending
    ? 'Saving response rating'
    : rating === 'good'
      ? 'Rated good response'
      : rating === 'bad'
        ? 'Rated bad response'
        : 'Rate response';
  const label = comment && !save.isPending ? `${ratingLabel}, with comment` : ratingLabel;
  const Icon = save.isPending
    ? LoaderCircleIcon
    : rating === 'bad'
      ? ThumbsDownIcon
      : !rating && comment
        ? MessageSquareIcon
        : ThumbsUpIcon;
  const change = (value: 'good' | 'bad' | null) => {
    if (busy || stored.isError || value === (rating ?? null)) return;
    save.mutate({
      feedback_id: crypto.randomUUID(),
      expected_feedback_id: stored.data?.feedback?.feedback_id ?? null,
      rating: value,
    });
  };
  const submitComment = (value: 'good' | 'bad' | null, text: string) => {
    if (busy || stored.isError) return;
    save.mutate({
      feedback_id: crypto.randomUUID(),
      expected_feedback_id: stored.data?.feedback?.feedback_id ?? null,
      rating: value,
      comment: text,
    });
  };
  const editComment = () => {
    save.reset();
    setCommentOpen(true);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MessageAction
            ref={triggerRef}
            label={label}
            title={label}
            disabled={busy}
            className={rating || comment ? 'text-primary' : undefined}
          >
            <Icon
              aria-hidden="true"
              className={`size-3.5${save.isPending ? ' animate-spin' : ''}`}
            />
          </MessageAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-52"
          onCloseAutoFocus={(event) => {
            if (commentOpen) event.preventDefault();
          }}
        >
          {stored.isError ? (
            <DropdownMenuItem onSelect={() => void stored.refetch()}>
              Retry loading rating
            </DropdownMenuItem>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 pb-1 pl-1.5">
                <span className="text-xs text-muted-foreground">Response feedback</span>
                <DropdownMenuItem asChild onSelect={editComment} disabled={busy}>
                  <Button
                    aria-label={comment ? 'Edit feedback comment' : 'Add feedback comment'}
                    title={comment ? 'Edit feedback comment' : 'Add feedback comment'}
                    className="size-6 justify-center p-0"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <AddIcon aria-hidden="true" className="size-3.5" />
                  </Button>
                </DropdownMenuItem>
              </div>
              <DropdownMenuRadioGroup value={rating ?? ''}>
                <DropdownMenuRadioItem
                  value="good"
                  onSelect={() => change(rating === 'good' ? null : 'good')}
                >
                  <ThumbsUpIcon aria-hidden="true" className="size-3.5" /> Good response
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="bad"
                  onSelect={() => change(rating === 'bad' ? null : 'bad')}
                >
                  <ThumbsDownIcon aria-hidden="true" className="size-3.5" /> Bad response
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {comment ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={editComment}>
                    <MessageSquareIcon aria-hidden="true" className="size-3.5" />
                    <span className="line-clamp-2 break-words">{comment}</span>
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {commentOpen ? (
        <ResponseFeedbackComment
          rating={rating ?? null}
          comment={comment}
          saving={save.isPending}
          error={
            save.isError
              ? 'Could not save your feedback. Your comment is still here; please try again.'
              : undefined
          }
          onClose={() => setCommentOpen(false)}
          onSave={submitComment}
          onRestoreFocus={() => requestAnimationFrame(() => triggerRef.current?.focus())}
        />
      ) : null}
    </>
  );
}
