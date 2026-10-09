import { attentionDomainLabel, type AttentionAvailable } from '@clio/core/v3';
import { RadarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AttentionModeState } from '@/hooks/use-attention-mode';
import { attentionDomainColor } from '@/lib/attention-domain-colors';
import { formatSharePercent as pct } from '@/lib/attention-text';
import { truncate } from '@/lib/format';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { AttentionProfileEditor } from './attention-profile-editor';
import { InfoTip } from './info-tip';
import type { AttentionProfile } from '@clio/core/v3';

const QUOTE_TRUNCATE_CHARS = 160;

/** `residual` is real attention, just spread thinly outside the capture's top-10%-per-segment cut. */
const SPREAD_THIN_TOOLTIP =
  'Attention spread across the parts of the conversation outside the top 10% the capture keeps.';

/**
 * The pinned "Attention mode" banner: the quoted selection, an X back to the
 * normal transcript, and (once shown) the source breakdown for what produced
 * it. `state.status === 'idle'` renders nothing — the caller mounts this
 * unconditionally above the transcript.
 */
export function AttentionModeBanner({
  onDismiss,
  state,
  onProfileChange,
}: {
  onDismiss: () => void;
  state: AttentionModeState;
  onProfileChange?: (profile: AttentionProfile) => void;
}) {
  if (state.status === 'idle') return null;
  return (
    <div
      className="sticky top-0 z-20 shrink-0 border-b bg-background/95 px-4 py-2 backdrop-blur sm:px-6"
      data-slot="attention-mode-banner"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        <div className="flex items-start gap-2">
          <RadarIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Attention mode</span>
              {state.status === 'loading' ? <Spinner className="size-3.5" /> : null}
            </div>
            <p
              className="mt-0.5 truncate text-xs text-muted-foreground"
              title={state.selection.text}
            >
              “{truncate(state.selection.text, QUOTE_TRUNCATE_CHARS)}”
            </p>
          </div>
          <Button
            aria-label="Exit attention mode"
            className="shrink-0"
            onClick={onDismiss}
            size="icon-xs"
            variant="ghost"
          >
            <CloseIcon aria-hidden="true" />
          </Button>
        </div>
        {state.status === 'unavailable' ? (
          <p className="text-xs text-muted-foreground" data-slot="attention-unavailable-message">
            {state.message}
          </p>
        ) : null}
        {state.status === 'shown' ? <AttentionBreakdown data={state.data} /> : null}
        {state.status === 'shown' && state.data.profile && onProfileChange ? (
          <AttentionProfileEditor profile={state.data.profile} onApply={onProfileChange} />
        ) : null}
      </div>
    </div>
  );
}

/** Every prompt section the capture scored (system, tool definitions, tool calls/results, user, …) plus the spread-thin residual. */
export function AttentionBreakdown({
  data,
}: {
  data: Pick<AttentionAvailable, 'residual' | 'flags' | 'unmapped_content'> & {
    sources: readonly { domain: string; share: number }[];
  };
}) {
  const sources = [...data.sources]
    .filter((source) => source.share > 0)
    .sort((left, right) => right.share - left.share);
  const dominant = data.flags.find((flag) => flag.kind === 'tool_result_dominant');
  return (
    <div className="flex flex-col gap-1.5" data-slot="attention-breakdown">
      <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {sources.map((source) => (
          <Tooltip key={source.domain}>
            <TooltipTrigger asChild>
              <span
                style={{
                  backgroundColor: attentionDomainColor(source.domain),
                  width: `${Math.max(0.5, source.share * 100)}%`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {attentionDomainLabel(source.domain)}: {pct(source.share)}
            </TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="bg-muted-foreground/30" style={{ width: `${data.residual * 100}%` }} />
          </TooltipTrigger>
          <TooltipContent>
            Spread thin: {pct(data.residual)}. {SPREAD_THIN_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {sources.map((source) => (
          <span className="inline-flex items-center gap-1.5" key={source.domain}>
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: attentionDomainColor(source.domain) }}
            />
            {attentionDomainLabel(source.domain)} {pct(source.share)}
          </span>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-muted-foreground/30"
              />
              Spread thin {pct(data.residual)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{SPREAD_THIN_TOOLTIP}</TooltipContent>
        </Tooltip>
        {dominant ? (
          <Badge className="border-chart-5/40 text-chart-5" variant="outline">
            Tool results lead captured content
          </Badge>
        ) : null}
        {data.unmapped_content?.length ? (
          <span className="inline-flex items-center gap-1.5">
            {data.unmapped_content.length} unmapped{' '}
            {data.unmapped_content.length === 1 ? 'block' : 'blocks'}
            <InfoTip label="About unmapped attention content">
              These blocks have no unique compatible passage in the captured prompt. Their content
              may be absent, transformed, or repeated. No transcript heat is inferred.
            </InfoTip>
          </span>
        ) : null}
      </div>
    </div>
  );
}
