import type { PendingInteraction } from '@clio/core/v3';
import { MessageCircleQuestionIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuestionAnswer } from './question-answer-context';
import { isVariantPickInteraction } from '@/lib/variant-runs';

export function OpenQuestionsTracker({
  interactions,
  bottomInset,
}: {
  interactions: readonly PendingInteraction[];
  bottomInset: number;
}) {
  const answer = useQuestionAnswer();
  const [open, setOpen] = useState(false);
  const questions = interactions.filter(
    (row) =>
      row.kind === 'question' &&
      row.status === 'pending' &&
      row.requires_human_response !== false &&
      !row.payload?.plan_exit &&
      !isVariantPickInteraction(row),
  );
  if (!questions.length || !answer?.openQuestion) return null;
  return (
    <aside
      aria-label="Open questions tracker"
      className="absolute right-3 z-20"
      style={{ bottom: bottomInset + 12 }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={`${questions.length} open question${questions.length === 1 ? '' : 's'}`}
            size="sm"
            variant="outline"
            className="rounded-full bg-background"
          >
            <MessageCircleQuestionIcon aria-hidden="true" />
            {questions.length}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="max-h-80 w-80 overflow-y-auto">
          <p className="mb-2 text-sm font-medium">Open questions</p>
          {questions.map((row) => (
            <Button
              key={row.id}
              variant="ghost"
              className="mb-1 h-auto w-full flex-col items-start whitespace-normal text-left"
              onClick={() => {
                setOpen(false);
                answer.openQuestion?.(row);
              }}
            >
              <span className="text-xs text-muted-foreground">
                {row.payload?.response_mode === 'async'
                  ? 'Answer when ready'
                  : 'Answer needed to continue'}
              </span>
              <span>{row.prompt ?? row.title}</span>
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </aside>
  );
}
