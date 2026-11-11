import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EarlierMessagesControl } from './conversation-types';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { TechnicalDetails } from './technical-details';

/**
 * One quiet 28px line above the oldest loaded message: older messages exist
 * (and load on click), are loading, or did not load (with Retry).
 */
export const EarlierMessagesRow = memo(function EarlierMessagesRow({
  earlier,
  className,
}: {
  earlier: EarlierMessagesControl;
  className?: string;
}) {
  return (
    <div
      className={cn('mx-auto w-full px-(--conversation-gutter) pt-2', className)}
      data-slot="earlier-messages"
    >
      {earlier.loading ? (
        <StateView kind="loading" size="row" title="Loading earlier messages…" />
      ) : earlier.error ? (
        <StateView
          action={{ label: 'Retry', onClick: earlier.load }}
          className="w-fit max-w-full"
          kind="error"
          size="row"
          title="Earlier messages didn’t load"
        />
      ) : (
        <Button
          className="h-7 gap-2 px-1.5 text-[12.5px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground"
          onClick={earlier.load}
          type="button"
          variant="ghost"
        >
          <ArrowUpIcon aria-hidden="true" className="size-3.5" />
          Load earlier messages
        </Button>
      )}
    </div>
  );
});

/**
 * The empty transcript while its first page is on the way, centred where the
 * messages (or their load error) will appear.
 */
export function TranscriptLoading() {
  return <StateView className="h-full" kind="loading" size="panel" title="Loading messages…" />;
}

/**
 * The transcript could not be read. It names what failed in product words and
 * offers Retry; the service's own message stays in Technical details.
 */
export function TranscriptLoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4">
      <StateView
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        className="min-h-0"
        kind="error"
        size="panel"
        title="This conversation could not be loaded"
      />
      <TechnicalDetails
        className="flex max-w-md flex-col items-center"
        contentClassName="pt-1.5 font-mono text-[11.5px] break-words whitespace-pre-wrap text-muted-foreground"
        summaryClassName="text-[12px]"
        title="Technical details"
      >
        {error}
      </TechnicalDetails>
    </div>
  );
}

/** A background refresh, at row height in the control lane so it never covers a message. */
export function TranscriptSyncing() {
  return <StateView className="w-fit" kind="loading" size="row" title="Syncing history…" />;
}

/** Height of the lane above the composer that holds the transcript's floating controls. */
export const TRANSCRIPT_CONTROL_LANE_PX = 40;

/**
 * The lane above the composer for "Jump to latest". It is a sticky, opaque
 * band at the end of the scroller: scrolled up, transcript text passes behind
 * it like behind the composer instead of under a floating button; at the end,
 * its own height keeps the last line clear of it. Being inside the scroller, a
 * wheel over it still scrolls the transcript and reaches the intent handlers.
 * Sticky offsets are measured inside the scroller's padding, which already
 * holds the composer inset.
 */
export const TranscriptControlLane = memo(function TranscriptControlLane({
  onJump,
  syncing,
}: {
  /** Present while the reader is away from the latest message. */
  onJump?: () => void;
  /** A background refresh of the history is in flight. */
  syncing?: boolean;
}) {
  return (
    <div
      className="sticky bottom-0 z-20 flex items-center justify-center gap-3 bg-background"
      data-slot="transcript-control-lane"
      style={{ height: TRANSCRIPT_CONTROL_LANE_PX }}
    >
      {syncing ? <TranscriptSyncing /> : null}
      {onJump ? (
        <TooltipProvider>
          <IconButton
            className="rounded-full border border-border bg-background shadow-sm"
            icon={<ArrowDownIcon aria-hidden="true" />}
            label="Jump to latest"
            onClick={onJump}
            tooltipSide="top"
            type="button"
          />
        </TooltipProvider>
      ) : null}
    </div>
  );
});
