import { ChevronRightIcon, MessageSquareTextIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { GroundedMessageResponse } from './grounded-message-response';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';

/** Reveal recorded thinking on demand, retaining the reader's choice across updates. */
export function TranscriptReasoningPassage({
  id,
  text,
  streaming = false,
  source,
}: {
  id?: string;
  text: string;
  streaming?: boolean;
  source?: ThoughtSource;
}) {
  const key = source
    ? `thinking:${source.sessionId}:${source.messageId}:${source.partId}:${source.field}`
    : id
      ? `thinking:${id}`
      : undefined;
  const [open, setOpen] = useTranscriptDisclosure(key);
  const title = text.match(
    /^\s*(?:#{1,6}[^\S\r\n]+[^\r\n]+|\*\*[^\r\n]+\*\*|__[^\r\n]+__)[^\S\r\n]*(?:\r?\n|$)/u,
  );
  const bodyStart = title?.[0].length ?? 0;
  const heading = text
    .trim()
    .split('\n', 1)[0]
    .replace(/^[\s#]+|[*_`]/gu, '')
    .trim();
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      aria-busy={streaming || undefined}
      data-slot="transcript-reasoning"
      className="min-w-0"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Thinking: ${heading || 'Details'}`}
          className="h-auto min-h-7 w-full min-w-0 justify-start gap-2 rounded-sm px-1 py-1 text-xs font-normal text-muted-foreground"
        >
          {streaming ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-primary"
            />
          ) : (
            <MessageSquareTextIcon aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          <span className="shrink-0 font-medium">Thinking</span>
          <span className="min-w-0 flex-1 truncate text-left">{heading}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="region"
          aria-label="Thinking details"
          className="my-1 max-h-80 min-w-0 overflow-auto overscroll-contain pl-6 text-sm text-muted-foreground [overflow-wrap:anywhere]"
          data-slot="transcript-reasoning-text"
          tabIndex={0}
        >
          <TranscriptReasoning text={text} source={source} sourceStart={bodyStart}>
            <GroundedMessageResponse className="leading-6" isAnimating={streaming}>
              {text.slice(bodyStart)}
            </GroundedMessageResponse>
          </TranscriptReasoning>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
