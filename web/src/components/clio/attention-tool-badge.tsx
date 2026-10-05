import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSharePercent } from '@/lib/attention-text';
import { cn } from '@/lib/utils';

const HEAT_BUCKET_CLASS = [
  'border-chart-5/30 text-chart-5/80',
  'border-chart-5/50 text-chart-5',
  'border-chart-5/70 text-chart-5',
  'border-chart-5 bg-chart-5/10 text-chart-5',
] as const;

/**
 * A small badge on a (often collapsed) tool card, so a heated tool call is
 * visible without expanding it. `share` is this tool step's fraction of the
 * selection's total attention; `bucket` is its intensity relative to the
 * heaviest contributor in the same result, for a consistent visual scale
 * across every heated block in the transcript.
 */
export function ClioAttentionToolBadge({ bucket, share }: { bucket: number; share: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium tabular-nums',
            HEAT_BUCKET_CLASS[bucket],
          )}
          data-slot="attention-tool-badge"
        >
          {formatSharePercent(share)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatSharePercent(share)} of attention traced to this tool call</TooltipContent>
    </Tooltip>
  );
}
