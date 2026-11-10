import { attentionDomainLabel, type AttentionAvailable } from '@clio/core/v3';
import { RadarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AttentionModeState } from '@/hooks/use-attention-mode';
import { attentionDomainColor } from '@/lib/attention-domain-colors';
import { formatSharePercent as pct } from '@/lib/attention-text';
import { truncate } from '@/lib/format';
import type { AttentionHeatView } from '@/lib/attention-segment-heat';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { AttentionProfileEditor } from './attention-profile-editor';
import { AttentionHeatViewControls } from './attention-heat-view-controls';
import { InfoTip } from './info-tip';
import { FrameBar } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { RingSpinner } from './primitives/ring-spinner';
import type { AttentionProfile } from '@clio/core/v3';

const QUOTE_TRUNCATE_CHARS = 160;

/** `residual` is real attention, just spread thinly outside the capture's top-10%-per-segment cut. */
const SPREAD_THIN_TOOLTIP =
  'Attention spread across the parts of the conversation outside the top 10% the capture keeps.';

/**
 * Attention mode's one bar, the same frame bar as a tab (runs-attention 08): radar and
 * "Attention mode" (the quoted selection on hover), a fact when tool results lead,
 * Lines Words Tokens and Max Mean, the heat profile's sliders icon, then X back to the
 * normal transcript. The source breakdown sits as one quiet strip under the bar.
 * `state.status === 'idle'` renders nothing; the caller mounts this above the transcript.
 */
export function AttentionModeBanner({
  onDismiss,
  state,
  onProfileChange,
  view,
  onViewChange,
}: {
  onDismiss: () => void;
  state: AttentionModeState;
  onProfileChange?: (profile: AttentionProfile) => void;
  view?: AttentionHeatView;
  onViewChange?: (view: AttentionHeatView) => void;
}) {
  if (state.status === 'idle') return null;
  const shown = state.status === 'shown' ? state.data : undefined;
  const dominant = shown?.flags.some((flag) => flag.kind === 'tool_result_dominant');
  const quote = `“${truncate(state.selection.text, QUOTE_TRUNCATE_CHARS)}”`;
  return (
    <div
      className="@container/attention sticky top-0 z-20 shrink-0 bg-background"
      data-slot="attention-mode-banner"
    >
      <FrameBar
        label="Attention mode"
        where={
          <span
            className="flex min-w-0 shrink-0 items-center gap-1.5 text-[12.5px]"
            title={`Attention mode: ${quote}`}
          >
            <RadarIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            {/* A phone keeps the radar (its name on hover) so the heat segments fit whole. */}
            <b className="font-medium whitespace-nowrap text-foreground @max-[460px]/attention:sr-only">
              Attention mode
            </b>
            {state.status === 'loading' ? <RingSpinner /> : null}
          </span>
        }
        what={
          state.status === 'loading' ? (
            <span role="status">Loading</span>
          ) : state.status === 'unavailable' ? (
            <span data-slot="attention-unavailable-message" title={state.message}>
              {state.message}
            </span>
          ) : dominant ? (
            <span title="Tool results lead captured content">tool results first</span>
          ) : (
            <span className="truncate" title={state.selection.text}>
              {quote}
            </span>
          )
        }
        format={
          shown && view && onViewChange ? (
            <AttentionHeatViewControls
              meanAvailable={shown.blocks.every((block) => block.token_starts !== undefined)}
              onChange={onViewChange}
              view={view}
            />
          ) : undefined
        }
        actions={
          <>
            {shown?.profile && onProfileChange ? (
              <AttentionProfileEditor iconOnly onApply={onProfileChange} profile={shown.profile} />
            ) : null}
            <IconButton icon={<CloseIcon />} label="Exit attention mode" onClick={onDismiss} />
          </>
        }
      />
      {shown ? (
        <div className="border-b border-border px-2 py-1.5">
          <AttentionBreakdown data={shown} hideFlags={dominant} />
        </div>
      ) : null}
    </div>
  );
}
/** Every prompt section the capture scored (system, tool definitions, tool calls/results, user, …) plus the spread-thin residual. */
export function AttentionBreakdown({
  data,
  hideFlags = false,
}: {
  data: Pick<AttentionAvailable, 'residual' | 'flags' | 'unmapped_content'> & {
    sources: readonly { domain: string; share: number }[];
  };
  /** The frame bar already names the lead ("tool results first"). */
  hideFlags?: boolean;
}) {
  const sources = [...data.sources]
    .filter((source) => source.share > 0)
    .sort((left, right) => right.share - left.share);
  const dominant = hideFlags
    ? undefined
    : data.flags.find((flag) => flag.kind === 'tool_result_dominant');
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
