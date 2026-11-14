import { TransportError, type RunState, type StreamState } from '@clio/core/v3';
import { AlertTriangleIcon } from 'lucide-react';
import { m, useIsPresent } from 'motion/react';
import { forwardRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { isOfflineError } from '@/lib/list-state';
import { cn } from '@/lib/utils';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { DeleteResourceDialog, type ResourceActions } from './resource-dialogs';
import { NamedTooltip } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { TechnicalDetails } from './technical-details';
import { SessionWorkStatus } from './session-work';
import { plural, t, ph } from '@lingui/core/macro';

/**
 * Keeps an exiting transcript surface (the welcome state, the conversation)
 * mounted and out of the tab/AT order through its `AnimatePresence` fade,
 * rather than snapping away mid-animation.
 */
export const TranscriptPresenceSurface = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className: string }
>(function TranscriptPresenceSurface({ children, className }, ref) {
  const isPresent = useIsPresent();
  return (
    <m.div
      ref={ref}
      animate={{ opacity: 1 }}
      aria-hidden={!isPresent}
      className={className}
      exit={{ opacity: 0 }}
      inert={!isPresent}
      initial={{ opacity: 0 }}
    >
      {children}
    </m.div>
  );
});

/**
 * The spec's inline state (conversation-states: "Inline, in the transcript"):
 * one 28px line with the failure in product words and at most one action. The
 * service's own words stay in Technical details beside it.
 */
function TranscriptStateRow({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  /** `retry` marks the Retry action, which keeps its icon; other actions read as words only. */
  action?: { label: string; onClick: () => void; retry?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1', className)}
      data-slot="transcript-state-row"
    >
      <StateView
        action={
          action
            ? {
                label: action.label,
                onClick: action.onClick,
                icon: action.retry ? undefined : null,
              }
            : undefined
        }
        className="w-fit max-w-full"
        kind="error"
        size="row"
        title={title}
      />
      {detail && detail !== title ? (
        <TechnicalDetails
          className="min-w-0"
          contentClassName="pt-1 font-mono text-label break-words whitespace-pre-wrap text-muted-foreground"
          summaryClassName="text-meta"
          title={t`Technical details`}
        >
          {detail}
        </TechnicalDetails>
      ) : null}
    </div>
  );
}

/** Surface failed user actions alongside the composer, independently of stream health. */
export function WorkspaceActionAlerts({
  actionError,
  retryError,
  notice,
}: {
  actionError?: string;
  retryError?: string;
  /** A failure that no action of the person caused, already in product words. */
  notice?: string;
}) {
  return (
    <>
      {notice ? <TranscriptStateRow className="mx-4 mb-1" title={notice} /> : null}
      {[
        [t`That action didn’t run`, actionError],
        [t`The reply couldn’t be retried`, retryError],
      ].map(([title, error]) =>
        error ? (
          <TranscriptStateRow key={title} className="mx-4 mb-1" detail={error} title={title!} />
        ) : null,
      )}
    </>
  );
}

/** Keep recoverable transcript failures visible without replacing the conversation. */
export function WorkspaceTranscriptAlerts({
  sessionFailed,
  streamError,
  transcriptError,
  onRetry,
  removal,
}: {
  sessionFailed?: boolean;
  streamError?: string;
  transcriptError?: string;
  /** Reads the transcript again after a recoverable failure. */
  onRetry?: () => void;
  /** Offered when the stored transcript is damaged and no retry can read it again. */
  removal?: { actions: ResourceActions; session: { id: string; title: string } };
}) {
  const [removing, setRemoving] = useState(false);
  // An update in flight (including the post-restart `reconnecting` window)
  // already has its own update page explaining
  // exactly what is happening -- surfacing the stream's own "it broke"
  // language on top of that would contradict it and confuse an outage that
  // is entirely expected. `transcriptError` (a REST fetch failure) is left
  // alone: reading the transcript can still fail during the outage for
  // reasons the update itself does not explain.
  const updateInFlight = useUpdateFlowStore((state) => isUpdateInFlight(state.step));
  const retry = onRetry ? { label: t`Retry`, onClick: onRetry, retry: true } : undefined;
  return (
    <>
      {sessionFailed ? (
        <TranscriptStateRow
          className="mx-3 mt-2"
          title={t`${ph({ agent: vocab.agent })} stopped before finishing this turn`}
        />
      ) : null}
      {streamError && !updateInFlight ? (
        // The live stream lost its place and could not catch up; reading again restores it.
        <TranscriptStateRow
          action={retry}
          className="mx-3 mt-2"
          detail={streamError}
          title={t`Some updates may be missing`}
        />
      ) : null}
      {transcriptError && removal ? (
        <TranscriptStateRow
          action={{ label: t`Remove conversation`, onClick: () => setRemoving(true) }}
          className="mx-3 mt-2"
          detail={transcriptError}
          title={t`This conversation can’t be read`}
        />
      ) : transcriptError ? (
        // The shown messages stay; the failed read is one line with Retry.
        <TranscriptStateRow
          action={retry}
          className="mx-3 mt-2"
          detail={transcriptError}
          title={t`The latest messages could not be loaded`}
        />
      ) : null}
      {removal && removing ? (
        <DeleteResourceDialog
          actions={removal.actions}
          onClose={() => setRemoving(false)}
          target={{ kind: 'session', id: removal.session.id, label: removal.session.title }}
        />
      ) : null}
    </>
  );
}
/**
 * The spec's page-level Error state (conversation-states: states) for a
 * conversation or workspace that did not open: plain words for what happened,
 * Retry, and a way back. It sits inside the shell, so both bars stay.
 */
export function WorkspaceUnavailable({
  subject,
  error,
  onRetry,
  back,
}: {
  subject: 'conversation' | 'workspace';
  /** The failed read; none when the service answered without the item. */
  error?: unknown;
  onRetry?: () => void;
  /** Where to go instead, e.g. the conversation's workspace. */
  back?: { label: string; to: string };
}) {
  const navigate = useNavigate();
  const { agent, workspace } = vocab;
  const conversation = subject === 'conversation';
  const missing = error === undefined || isNotFoundError(error);
  const offline = !missing && isOfflineError(error);
  const title = missing
    ? conversation
      ? t`This conversation isn't available`
      : t`This ${workspace} isn't available`
    : offline
      ? t`Can't reach ${agent}`
      : conversation
        ? t`This conversation couldn't be opened`
        : t`This ${workspace} couldn't be opened`;
  const detail = missing
    ? subject === 'conversation'
      ? t`It may have been deleted or moved.`
      : t`It may have been deleted, or it belongs to another connection.`
    : offline
      ? t`Check that ${agent} is running, then retry.`
      : withoutIdentifiers(error instanceof Error ? error.message : String(error));
  return (
    <section
      aria-label={title}
      className="grid h-full min-h-0 place-items-center bg-background p-6"
    >
      <StateView
        action={onRetry ? { label: t`Retry`, onClick: onRetry } : undefined}
        className="w-full max-w-xl"
        detail={detail}
        kind="error"
        link={
          back && !offline
            ? { label: back.label, onClick: () => navigate(back.to) }
            : { label: t`Manage connections`, onClick: () => navigate('/?intent=connect') }
        }
        size="page"
        title={title}
      />
    </section>
  );
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof TransportError && error.status === 404) return true;
  return error instanceof Error && /\bnot[ _]found\b/i.test(error.message);
}

// Service messages name ids ("session not found: sess_…"); the page names the thing instead.
function withoutIdentifiers(message: string): string {
  const plain = message
    .replace(/\b(?:sess|ws|run|task|msg)_[0-9a-z]+\b/gi, '')
    .replace(/[\s:,]+$/, '')
    .trim();
  return plain ? `${plain.charAt(0).toUpperCase()}${plain.slice(1)}.`.replace(/\.\.$/, '.') : '';
}

/** The spec's page Loading state (`.xs.pn`): a spinner and one line. */
export function WorkspaceHydrating({ label = t`Opening conversation` }: { label?: string }) {
  return (
    <section
      aria-label={t`Conversation loading`}
      className="grid h-full min-h-0 place-items-center bg-background p-6"
    >
      <StateView kind="loading" title={label} />
    </section>
  );
}

export function WorkspaceStatusStrip({
  activeWorkCount,
  unresolvedWorkCount = 0,
  cursor,
  sessionState,
  stream,
  sessionId,
  onOpenWork,
  onInspectTasks,
}: {
  sessionId?: string;
  onOpenWork?: () => void;
  onInspectTasks?: () => void;
  activeWorkCount: number;
  unresolvedWorkCount?: number;
  cursor?: string;
  sessionState?: RunState;
  stream: StreamState;
}) {
  const { agent } = vocab;
  const inspectionLabel = plural(unresolvedWorkCount, {
    one: '# task needs inspection',
    other: '# tasks need inspection',
  });
  const activeWorkLabel =
    unresolvedWorkCount > 0
      ? sessionState === 'running'
        ? t`${agent} running; ${inspectionLabel}`
        : inspectionLabel
      : sessionState === 'running'
        ? activeWorkCount
          ? plural(activeWorkCount, {
              one: `${agent} running with # active item`,
              other: `${agent} running with # active items`,
            })
          : t`${agent} running`
        : activeWorkCount === 0
          ? t`No active work`
          : plural(activeWorkCount, { one: '# active item', other: '# active items' });
  const offline = stream === 'offline';
  const recoveryLabel = offline
    ? t`Can't reach ${agent}, retrying`
    : stream === 'reconnecting'
      ? t`Resuming updates`
      : stream === 'gapped'
        ? t`Checking for missed updates`
        : undefined;
  const recoveryDetail = cursor
    ? t`Recovery checkpoint ${ph({ checkpoint: cursor.slice(-10) })}`
    : t`No recovery checkpoint was reported`;
  return (
    <div
      className="flex shrink-0 items-center gap-1 text-meta whitespace-nowrap text-muted-foreground"
      data-slot="top-bar-status"
    >
      {recoveryLabel ? (
        <span
          className={cn('flex items-center gap-1 px-1', offline && 'text-destructive')}
          title={offline ? recoveryLabel : recoveryDetail}
        >
          <StatusIndicator
            display="column"
            label={recoveryLabel}
            tone={offline ? 'error' : 'waiting'}
          />
          <span className="hidden md:inline">{recoveryLabel}</span>
          {/* A phone keeps the outage in words, not only the glyph. */}
          {offline ? <span className="md:hidden">{t`Offline`}</span> : null}
        </span>
      ) : null}
      {unresolvedWorkCount > 0 && onInspectTasks ? (
        <NamedTooltip label={activeWorkLabel}>
          <Button
            aria-label={t`Inspect unresolved tasks`}
            className="h-7 gap-1.5 px-1.5 text-meta text-warning-foreground hover:bg-hover"
            onClick={onInspectTasks}
            type="button"
            variant="ghost"
          >
            <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true" className="tabular-nums">
              {t`${unresolvedWorkCount} to inspect`}
            </span>
            <span className="sr-only">{activeWorkLabel}</span>
          </Button>
        </NamedTooltip>
      ) : sessionId && onOpenWork ? (
        <SessionWorkStatus sessionId={sessionId} onOpen={onOpenWork} />
      ) : null}
    </div>
  );
}
