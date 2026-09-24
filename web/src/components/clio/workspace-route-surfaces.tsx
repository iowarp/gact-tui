import type { RunState, StreamState } from '@clio/core/v3';
import { AlertTriangleIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { LiveConnectionIndicator } from './live-connection-indicator';
import { SystemVersionStatus } from './navigation-version-status';
import { ClioStatus } from './status';

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
  streamError,
  transcriptError,
}: {
  streamError?: string;
  transcriptError?: string;
}) {
  return (
    <>
      {streamError ? (
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
        </Alert>
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

export function WorkspaceLoading({
  description = 'Reading the latest workspace state from the selected agent service.',
  label = 'Opening conversation',
}: {
  description?: string;
  label?: string;
} = {}) {
  return (
    <main className="grid h-full min-h-0 place-items-center bg-background p-6">
      <div className="grid justify-items-center gap-3 text-center">
        <ClioStatus label={label} value="connecting" />
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
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
  cost,
  cursor,
  tokens,
  sessionState,
  stream,
}: {
  activeWorkCount: number;
  /** Undefined when no turn ever reported a real cost -- shown as a muted
   * dash with a tooltip, never the word "Unavailable" (it isn't broken,
   * the provider just doesn't report a price). */
  cost?: number;
  cursor?: string;
  /** Cumulative input+output token count for the session; always a real
   * number once the session has run a turn (0 before that). */
  tokens?: number;
  sessionState?: RunState;
  stream: StreamState;
}) {
  const activeWorkLabel =
    sessionState === 'running'
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
    <div className="flex h-full items-center gap-3 overflow-hidden text-[10px] text-muted-foreground">
      {/* Desktop already shows this indicator once, in the title bar
          (LiveConnectionIndicator there) -- the bottom bar drops its own
          copy there so the two surfaces never duplicate the same pill. */}
      {inTauri() ? null : <LiveConnectionIndicator />}
      {recoveryLabel ? <span title={recoveryDetail}>{recoveryLabel}</span> : null}
      <span>{activeWorkLabel}</span>
      <SystemVersionStatus />
      <span className="ml-auto hidden font-mono sm:inline">Tokens: {tokens ?? 0}</span>
      <span className="hidden items-center gap-1 font-mono sm:inline-flex">
        Cost:{' '}
        {cost === undefined ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-muted-foreground/70" tabIndex={0}>
                &mdash;
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">This provider doesn't report cost.</TooltipContent>
          </Tooltip>
        ) : (
          `$${cost.toFixed(4)}`
        )}
      </span>
    </div>
  );
}
