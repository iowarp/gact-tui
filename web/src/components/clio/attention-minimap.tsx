import type { AttentionAvailable, Message as DomainMessage } from '@clio/core/v3';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { attentionMinimapMarks } from '@/lib/attention-minimap-marks';
import { formatSharePercent } from '@/lib/attention-text';
import { cn } from '@/lib/utils';

const HEAT_BUCKET_CLASS = [
  'bg-chart-5/30',
  'bg-chart-5/55',
  'bg-chart-5/75',
  'bg-chart-5',
] as const;

/**
 * A thin strip along the transcript's right edge, one mark per message
 * "Understand attention" traced heat back to, positioned by that message's
 * position in the transcript and colored by how much of the total attention
 * landed there. Clicking a mark jumps the transcript to that message.
 */
export function ClioAttentionMinimap({
  data,
  messages,
  onJump,
  visible,
}: {
  data: AttentionAvailable | undefined;
  messages: readonly DomainMessage[];
  onJump: (index: number) => void;
  visible: boolean;
}) {
  const marks = attentionMinimapMarks(data, messages);
  if (!visible || marks.length === 0) return null;
  const span = Math.max(1, messages.length - 1);
  return (
    <aside
      aria-label="Attention minimap"
      className="absolute inset-y-3 right-1 z-10 w-3"
      data-slot="attention-minimap"
    >
      <div className="relative h-full w-full">
        {marks.map((mark) => (
          <HoverCard key={mark.messageId} openDelay={120}>
            <HoverCardTrigger asChild>
              <button
                aria-label={`Jump to attention at message ${mark.messageIndex + 1}`}
                className="group absolute left-0 flex h-3 w-full items-center justify-center outline-none"
                onClick={() => onJump(mark.messageIndex)}
                style={{ top: `${(mark.messageIndex / span) * 100}%` }}
                type="button"
              >
                <span
                  className={cn(
                    'size-2 rounded-full transition-transform group-hover:scale-125 group-focus-visible:scale-125',
                    HEAT_BUCKET_CLASS[mark.bucket],
                  )}
                />
              </button>
            </HoverCardTrigger>
            <HoverCardContent align="center" className="w-56 text-xs" side="left">
              <p className="font-medium">
                {mark.blockCount} highlighted {mark.blockCount === 1 ? 'part' : 'parts'}
              </p>
              <p className="text-muted-foreground">
                {formatSharePercent(mark.totalShare)} of attention traced here
              </p>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    </aside>
  );
}
