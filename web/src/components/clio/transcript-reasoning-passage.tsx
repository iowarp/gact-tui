import { BrainIcon } from 'lucide-react';
import { CollapsibleContent, Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ActivityBody, ActivityDisclosure, ActivityRow } from './activity-row';
import { CopyAction } from './tool-compact-row';
import { GroundedMessageResponse } from './grounded-message-response';
import { StatusIndicator } from './primitives/status-indicator';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';
import { useReasoningDuration } from './use-reasoning-duration';
import { plural, t } from '@lingui/core/macro';

/** "Thought for 6 seconds", "Thought for 2 minutes", or "Thought" when untimed. */
function thoughtName(durationMs: number | undefined, streaming: boolean): string {
  if (streaming) return t`Thinking…`;
  if (durationMs === undefined) return t`Thought`;
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60)
    return plural(seconds, { one: 'Thought for # second', other: 'Thought for # seconds' });
  const minutes = Math.round(seconds / 60);
  return plural(minutes, { one: 'Thought for # minute', other: 'Thought for # minutes' });
}

/**
 * A thinking passage as one activity row: "Thought for 6 seconds", or
 * "Thinking…" with a spinner while it streams. The thought itself reads in the
 * opened body, unframed. Thinking has no technical details; its ? column stays.
 */
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
  const key = source
    ? `thinking:${source.sessionId}:${source.messageId}:${source.partId}:${source.field}`
    : id
      ? `thinking:${id}`
      : undefined;
  const trimmed = text.trim();
  const firstLine = trimmed.split('\n', 1)[0];
  const hasDetails = trimmed.slice(firstLine.length).trim().length > 0;
  // A passage with more to read is open while it streams and folds once it settles,
  // unless the reader chose.
  const [open, setOpen] = useTranscriptDisclosure(key, streaming && hasDetails);
  const heading = firstLine
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/\*\*\*\*|____/gu, ' ')
    .replace(/(\*\*|__)(.*?)\1/gu, '$2')
    .replace(/`([^`]+)`/gu, '$1')
    .trim();
  const name = thoughtName(duration, streaming);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      aria-busy={streaming || undefined}
      data-slot="transcript-reasoning"
      className="min-w-0"
    >
      <ActivityRow
        open={open}
        onOpenChange={trimmed ? setOpen : undefined}
        disclosure={
          trimmed ? (
            <ActivityDisclosure
              open={open}
              label={heading ? t`Thinking: ${heading}` : t`Thinking: Details`}
              asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
            />
          ) : undefined
        }
        icon={<BrainIcon aria-hidden="true" />}
        name={
          <span data-slot="reasoning-summary" title={heading || undefined}>
            {name}
          </span>
        }
        actions={trimmed ? <CopyAction value={trimmed} label={t`Copy thought`} /> : null}
        elapsed={null}
        status={
          streaming ? (
            <StatusIndicator tone="running" label={t`Thinking`} display="column" mark="glyph" />
          ) : null
        }
        info={null}
      />
      <CollapsibleContent>
        <ActivityBody label={t`Thinking details`} framed={false}>
          <div
            className="max-h-80 overflow-auto overscroll-contain text-menu leading-[1.6] text-muted-foreground"
            data-slot="transcript-reasoning-text"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable
            tabIndex={0}
          >
            <TranscriptReasoning text={text} source={source}>
              <GroundedMessageResponse className="leading-[1.6]" isAnimating={streaming}>
                {text}
              </GroundedMessageResponse>
            </TranscriptReasoning>
          </div>
        </ActivityBody>
      </CollapsibleContent>
    </Collapsible>
  );
}
