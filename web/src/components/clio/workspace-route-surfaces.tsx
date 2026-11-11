import { TransportError, type RunState, type StreamState } from '@clio/core/v3';
import { AlertTriangleIcon } from 'lucide-react';
import { m, useIsPresent } from 'motion/react';
import { forwardRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { isOfflineError } from '@/lib/list-state';
import { cn } from '@/lib/utils';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { DeleteResourceDialog, type ResourceActions } from './resource-dialogs';
import { NamedTooltip } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { SessionWorkStatus } from './session-work';

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

/** Surface failed user actions alongside the composer, independently of stream health. */
export function WorkspaceActionAlerts({
  actionError,
  retryError,
}: {
  actionError?: string;
  retryError?: string;
}) {
  return (
    <>
      {[
        ['Action unavailable', actionError],
        ['Retry unavailable', retryError],
      ].map(([title, error]) =>
        error ? (
          <Alert key={title} className="mx-4 mb-3" variant="destructive">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
  removal,
}: {
  sessionFailed?: boolean;
  streamError?: string;
  transcriptError?: string;
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
  return (
    <>
      {sessionFailed ? (
        <Alert className="m-3 mb-0 rounded-lg" variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>The response failed</AlertTitle>
          <AlertDescription>
            The agent stopped before completing this turn. Retry the failed response below, or send
            a new message to continue.
          </AlertDescription>
        </Alert>
      ) : null}
      {streamError && !updateInFlight ? (
        <Alert className="m-3 mb-0 rounded-lg" variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Live stream needs reconciliation</AlertTitle>
          <AlertDescription>{streamError}</AlertDescription>
        </Alert>
      ) : null}
      {transcriptError ? (
        <Alert className="m-3 mb-0" variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Conversation unavailable</AlertTitle>
          <AlertDescription>{transcriptError}</AlertDescription>
          {removal ? (
            <div className="col-start-2 mt-2">
              <Button onClick={() => setRemoving(true)} size="sm" variant="outline">
                Remove conversation
              </Button>
            </div>
          ) : null}
        </Alert>
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
  const noun = subject === 'conversation' ? 'conversation' : vocab.workspace;
  const missing = error === undefined || isNotFoundError(error);
  const offline = !missing && isOfflineError(error);
  const title = missing
    ? `This ${noun} isn't available`
    : offline
      ? `Can't reach ${vocab.agent}`
      : `This ${noun} couldn't be opened`;
  const detail = missing
    ? subject === 'conversation'
      ? 'It may have been deleted or moved.'
      : 'It may have been deleted, or it belongs to another connection.'
    : offline
      ? `Check that ${vocab.agent} is running, then retry.`
      : withoutIdentifiers(error instanceof Error ? error.message : String(error));
  return (
    <section
      aria-label={title}
      className="grid h-full min-h-0 place-items-center bg-background p-6"
    >
      <StateView
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        className="w-full max-w-xl"
        detail={detail}
        kind="error"
        link={
          back && !offline
            ? { label: back.label, onClick: () => navigate(back.to) }
            : { label: 'Manage connections', onClick: () => navigate('/?intent=connect') }
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
export function WorkspaceHydrating({ label = 'Opening conversation' }: { label?: string }) {
  return (
    <section
      aria-label="Conversation loading"
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
  const inspectionLabel = `${unresolvedWorkCount} task${unresolvedWorkCount === 1 ? ' needs' : 's need'} inspection`;
  const activeWorkLabel =
    unresolvedWorkCount > 0
      ? `${sessionState === 'running' ? `${vocab.agent} running; ` : ''}${inspectionLabel}`
      : sessionState === 'running'
        ? `${vocab.agent} running${activeWorkCount ? ` with ${activeWorkCount} active item${activeWorkCount === 1 ? '' : 's'}` : ''}`
        : activeWorkCount === 0
          ? 'No active work'
          : `${activeWorkCount} active item${activeWorkCount === 1 ? '' : 's'}`;
  const offline = stream === 'offline';
  const recoveryLabel = offline
    ? `Can't reach ${vocab.agent}, retrying`
    : stream === 'reconnecting'
      ? 'Resuming updates'
      : stream === 'gapped'
        ? 'Checking for missed updates'
        : undefined;
  const recoveryDetail = cursor
    ? `Recovery checkpoint ${cursor.slice(-10)}`
    : 'No recovery checkpoint was reported';
  return (
    <div
      className="flex shrink-0 items-center gap-1 text-[12px] whitespace-nowrap text-muted-foreground"
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
          {offline ? <span className="md:hidden">Offline</span> : null}
        </span>
      ) : null}
      {unresolvedWorkCount > 0 && onInspectTasks ? (
        <NamedTooltip label={activeWorkLabel}>
          <Button
            aria-label="Inspect unresolved tasks"
            className="h-7 gap-1.5 px-1.5 text-[12px] text-warning-foreground hover:bg-hover"
            onClick={onInspectTasks}
            type="button"
            variant="ghost"
          >
            <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true" className="tabular-nums">
              {unresolvedWorkCount} to inspect
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
