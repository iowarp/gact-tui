import type { PendingInteraction } from '@clio/core/v3';
import { ArrowUpRightIcon, ChevronDownIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { followTranscriptLink } from '@/lib/inline-question';
import { useQuestionAnswer } from './question-answer-context';

/** One compact row per question; preview, source and full-text disclosure stay separate. */
export function OpenQuestionList({
  questions,
  onNavigate,
}: {
  questions: readonly PendingInteraction[];
  onNavigate?: () => void;
}) {
  const answer = useQuestionAnswer();
  const id = useId();
  const [expanded, setExpanded] = useState<string[]>([]);
  return (
    <ul aria-label="Questions awaiting your answer" className="min-w-0 space-y-1">
      {questions.map((row, index) => {
        const link = answer?.questionLink?.(row);
        const open = expanded.includes(row.id);
        const text = row.prompt ?? row.title;
        return (
          <Collapsible
            key={row.id}
            open={open}
            onOpenChange={(next) =>
              setExpanded(next ? [...expanded, row.id] : expanded.filter((key) => key !== row.id))
            }
            asChild
          >
            <li className="min-w-0 rounded-md border border-border/60">
              <div className="flex min-w-0 items-center gap-1 px-1 py-0.5">
                <Button
                  variant="ghost"
                  className="h-8 min-w-0 flex-1 justify-start gap-2 px-1.5 text-left text-xs font-normal"
                  aria-label={`Read and answer question ${index + 1}`}
                  onClick={() => {
                    onNavigate?.();
                    answer?.openQuestion?.(row);
                  }}
                >
                  <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{text}</span>
                </Button>
                {link ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Go to question ${index + 1}`}
                    title="Go to question"
                    onClick={() => {
                      onNavigate?.();
                      followTranscriptLink(link);
                    }}
                  >
                    <ArrowUpRightIcon className="size-3.5" />
                  </Button>
                ) : null}
                <CollapsibleTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${open ? 'Collapse' : 'Expand'} question ${index + 1}`}
                    aria-controls={`${id}-${index}`}
                    title={open ? 'Show less' : 'Show full question'}
                    className="group"
                  >
                    <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent id={`${id}-${index}`} className="px-3 pb-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  {row.payload?.response_mode === 'async'
                    ? 'Answer when ready'
                    : 'Answer needed to continue'}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                  {text}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 h-7 text-xs"
                  onClick={() => {
                    onNavigate?.();
                    answer?.openQuestion?.(row);
                  }}
                >
                  Read and answer
                </Button>
              </CollapsibleContent>
            </li>
          </Collapsible>
        );
      })}
    </ul>
  );
}
