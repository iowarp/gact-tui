import type { RunState, StreamState } from '@clio/core/v3';
import { AlertTriangleIcon } from 'lucide-react';
import { m, useIsPresent } from 'motion/react';
import { forwardRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { DeleteResourceDialog, type ResourceActions } from './resource-dialogs';
import { NamedTooltip } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';
import { ClioStatus } from './status';
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

export function WorkspaceUnavailable({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <main className="grid h-full min-h-0 place-items-center bg-background p-6">
      <Alert className="max-w-xl" variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>{capitalize(vocab.workspace)} unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {onRetry ? (
            <Button onClick={onRetry} variant="outline">
              Try again here
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link to="/?intent=connect">Manage connections</Link>
          </Button>
        </div>
      </Alert>
    </main>
  );
}

export function WorkspaceHydrating({ label = 'Opening conversation' }: { label?: string }) {
  return (
    <section
      aria-label="Conversation loading"
      aria-live="polite"
      className="grid h-full min-h-0 place-items-center bg-background p-6"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <ClioStatus label={label} value="connecting" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Restoring saved messages now. Newer messages will appear as they arrive.
        </p>
      </div>
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
  const recoveryLabel =
    stream === 'reconnecting'
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
        <span className="flex items-center gap-1 px-1" title={recoveryDetail}>
          <StatusIndicator display="column" label={recoveryLabel} tone="waiting" />
          <span className="hidden md:inline">{recoveryLabel}</span>
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
