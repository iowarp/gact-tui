import { attentionDomainLabel, type AttentionAvailable } from '@clio/core/v3';
import { RadarIcon, TriangleAlertIcon } from 'lucide-react';
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
import { plural, t, ph } from '@lingui/core/macro';

const QUOTE_TRUNCATE_CHARS = 160;

/** `residual` is real attention, just spread thinly outside the capture's top-10%-per-segment cut. */
const SPREAD_THIN_TOOLTIP = t`Attention spread across the parts of the conversation outside the top 10% the capture keeps.`;

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
        label={t`Attention mode`}
        where={
          <span
            className="flex min-w-0 shrink-0 items-center gap-1.5 text-menu"
            title={t`Attention mode: ${quote}`}
          >
            <RadarIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            {/* A phone keeps the radar (its name on hover) so the heat segments fit whole. */}
            <b className="font-medium whitespace-nowrap text-foreground @max-[460px]/attention:sr-only">
              {t`Attention mode`}
            </b>
            {state.status === 'loading' ? <RingSpinner /> : null}
          </span>
        }
        what={
          state.status === 'loading' ? (
            <span role="status">{t`Loading`}</span>
          ) : state.status === 'unavailable' ? (
            <span title={state.message}>{t`No heat`}</span>
          ) : dominant ? (
            <span title={t`Tool results lead captured content`}>{t`tool results first`}</span>
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
            <IconButton icon={<CloseIcon />} label={t`Exit attention mode`} onClick={onDismiss} />
          </>
        }
      />
      {shown ? (
        <div className="border-b border-border px-2 py-1.5">
          <AttentionBreakdown data={shown} hideFlags={dominant} />
        </div>
      ) : null}
      {state.status === 'unavailable' ? <AttentionUnavailableNotice state={state} /> : null}
    </div>
  );
}
/** Reasons meaning the canonical tokenizer did not reproduce the capture: a warning, not a gap. */
const ALIGNMENT_REASONS = new Set(['output_alignment_mismatch', 'range_alignment_mismatch']);

/**
 * Why no heat is shown, under the bar where it never folds away: the server's message and
 * its explanation (for a tokenizer that does not line up with the capture, the likely
 * cause). An alignment failure is a warning; any other reason reads as plain information.
 */
function AttentionUnavailableNotice({
  state,
}: {
  state: Extract<AttentionModeState, { status: 'unavailable' }>;
}) {
  const warning = state.reason !== undefined && ALIGNMENT_REASONS.has(state.reason);
  return (
    <div
      className={
        warning
          ? 'flex items-start gap-1.5 border-b border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-foreground'
          : 'flex items-start gap-1.5 border-b border-border px-2 py-1.5 text-xs text-muted-foreground'
      }
      data-reason={state.reason}
      data-slot="attention-unavailable-message"
      role={warning ? 'alert' : 'status'}
    >
      {warning ? (
        <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
      ) : null}
      <span className="min-w-0 break-words">
        {state.message}
        {state.detail ? <span className="text-muted-foreground"> {state.detail}</span> : null}
      </span>
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
            {t`Spread thin: ${ph({ share: pct(data.residual) })}. ${SPREAD_THIN_TOOLTIP}`}
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
              {t`Spread thin ${ph({ share: pct(data.residual) })}`}
            </span>
          </TooltipTrigger>
          <TooltipContent>{SPREAD_THIN_TOOLTIP}</TooltipContent>
        </Tooltip>
        {dominant ? (
          <Badge className="border-chart-5/40 text-chart-5" variant="outline">
            {t`Tool results lead captured content`}
          </Badge>
        ) : null}
        {data.unmapped_content?.length ? (
          <span className="inline-flex items-center gap-1.5">
            {plural(data.unmapped_content.length, {
              one: '# unmapped block',
              other: '# unmapped blocks',
            })}
            <InfoTip label={t`About unmapped attention content`}>
              {t`These blocks have no unique compatible passage in the captured prompt. Their content may be absent, transformed, or repeated. No transcript heat is inferred.`}
            </InfoTip>
          </span>
        ) : null}
      </div>
    </div>
  );
}
