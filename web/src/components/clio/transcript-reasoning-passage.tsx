import { ChevronRightIcon, MessageSquareTextIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { GroundedMessageResponse } from './grounded-message-response';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';
import { useReasoningDuration } from './use-reasoning-duration';
import { formatDuration } from '@/lib/format';

/** Show recorded reasoning plainly; disclose only passages with additional content. */
export function TranscriptReasoningPassage({
  id,
  text,
  streaming = false,
  source,
  startedAt,
  durationMs,
}: {
  id?: string;
  text: string;
  streaming?: boolean;
  source?: ThoughtSource;
  startedAt?: string;
  durationMs?: number;
}) {
  const duration = useReasoningDuration(startedAt, durationMs, streaming);
  const timing =
    duration !== undefined ? (
      <span
        className="shrink-0 tabular-nums text-muted-foreground"
        data-slot="reasoning-duration"
        title="Time this thinking passage was open in the conversation. Tool execution has its own timer."
        aria-label={`Reasoning phase: ${formatDuration(duration, 'tenths')}`}
      >
        {formatDuration(duration, 'tenths')}
      </span>
    ) : null;
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
  const trimmed = text.trim();
  const firstLine = trimmed.split('\n', 1)[0];
  const hasDetails = trimmed.slice(firstLine.length).trim().length > 0;
  const heading = firstLine
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/\*\*\*\*|____/gu, ' ')
    .replace(/(\*\*|__)(.*?)\1/gu, '$2')
    .replace(/`([^`]+)`/gu, '$1')
    .trim();
  const icon = streaming ? (
    <LoaderCircleIcon
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin text-muted-foreground"
    />
  ) : (
    <MessageSquareTextIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
  );
  if (!hasDetails) {
    return (
      <div
        aria-busy={streaming || undefined}
        data-slot="transcript-reasoning"
        className="flex min-h-7 w-full min-w-0 items-center gap-2 px-1 py-1 pr-7 text-xs font-normal text-foreground"
      >
        {icon}
        <span className="shrink-0 font-medium">Thinking</span>
        <div
          className="min-w-0 flex-1 whitespace-pre-wrap break-words text-left [overflow-wrap:anywhere]"
          data-slot="reasoning-summary"
        >
          <TranscriptReasoning text={text} source={source}>
            {heading}
          </TranscriptReasoning>
        </div>
        {timing}
        <span aria-hidden="true" className="size-3 shrink-0" />
      </div>
    );
  }
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
          className="h-auto min-h-7 w-full min-w-0 justify-start gap-2 rounded-sm px-1 py-1 pr-7 text-xs font-normal text-foreground aria-expanded:bg-transparent"
        >
          {icon}
          <span className="shrink-0 font-medium">Thinking</span>
          <span
            className="min-w-0 flex-1 truncate text-left font-normal"
            data-slot="reasoning-summary"
            title={heading}
          >
            {heading}
          </span>
          {timing}
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
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
