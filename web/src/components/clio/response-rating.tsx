import type { Message, RateResponseInput } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MessageAction } from '@/components/ai-elements/message';
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
  const queryKey = ['response-feedback', connectionScope(settings), sessionId, messageId];
  const stored = useQuery({
    queryKey,
    queryFn: ({ signal }) => repository.responseFeedback(sessionId, messageId, signal),
    retry: false,
  });
  const save = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: (input: RateResponseInput) => repository.rateResponse(sessionId, messageId, input),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
      toast.success(value.feedback?.rating ? 'Response rated' : 'Rating removed');
    },
    onError: () => {
      toast.error('Could not confirm your rating. Please try again.');
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const rating = stored.data?.feedback?.rating;
  const busy = stored.isPending || save.isPending;
  const label = save.isPending
    ? 'Saving response rating'
    : rating === 'good'
      ? 'Rated good response'
      : rating === 'bad'
        ? 'Rated bad response'
        : 'Rate response';
  const Icon = save.isPending ? LoaderCircleIcon : rating === 'bad' ? ThumbsDownIcon : ThumbsUpIcon;
  const change = (value: 'good' | 'bad' | null) => {
    if (busy || stored.isError || value === (rating ?? null)) return;
    save.mutate({
      feedback_id: crypto.randomUUID(),
      expected_feedback_id: stored.data?.feedback?.feedback_id ?? null,
      rating: value,
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MessageAction
          label={label}
          title={label}
          disabled={busy}
          className={rating ? 'text-primary' : undefined}
        >
          <Icon aria-hidden="true" className={`size-3.5${save.isPending ? ' animate-spin' : ''}`} />
        </MessageAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {stored.isError ? (
          <DropdownMenuItem onSelect={() => void stored.refetch()}>
            Retry loading rating
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuRadioGroup
              value={rating ?? ''}
              onValueChange={(value) => change(value as 'good' | 'bad')}
            >
              <DropdownMenuRadioItem value="good">
                <ThumbsUpIcon aria-hidden="true" className="size-3.5" /> Good response
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bad">
                <ThumbsDownIcon aria-hidden="true" className="size-3.5" /> Bad response
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {rating ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => change(null)}>Remove rating</DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
