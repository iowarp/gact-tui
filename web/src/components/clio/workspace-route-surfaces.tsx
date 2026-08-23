import type { RunState, StreamState } from '@clio/core/v3';
import { AlertTriangleIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ClioStatus } from './status';

export function WorkspaceUnavailable({ error }: { error: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <Alert className="max-w-xl" variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>Workspace unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/">Return to connections</Link>
        </Button>
      </Alert>
    </main>
  );
}

export function WorkspaceLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="grid justify-items-center gap-3 text-center">
        <ClioStatus label="Opening conversation" value="connecting" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Reading the latest workspace state from the selected agent service.
        </p>
      </div>
    </main>
  );
}

export function WorkspaceStatusStrip({
  activeWorkCount,
  cost,
  cursor,
  inputTokens,
  sessionState,
  stream,
  streamError,
}: {
  activeWorkCount: number;
  cost?: number;
  cursor?: string;
  inputTokens?: number;
  sessionState?: RunState;
  stream: StreamState;
  streamError?: string;
}) {
  const activeWorkLabel =
    sessionState === 'running'
      ? `Agent running${activeWorkCount ? ` with ${activeWorkCount} active item${activeWorkCount === 1 ? '' : 's'}` : ''}`
      : `${activeWorkCount} active work`;
  return (
    <div className="flex h-full items-center gap-3 overflow-hidden text-[10px] text-muted-foreground">
      <ClioStatus className="py-0.5" detail={streamError} value={stream} />
      <span className="font-mono">cursor {cursor ? cursor.slice(-10) : 'Unavailable'}</span>
      <span>{activeWorkLabel}</span>
      <span className="ml-auto hidden font-mono sm:inline">
        tokens {inputTokens ?? 'Unavailable'}, cost{' '}
        {cost === undefined ? 'Unavailable' : `$${cost.toFixed(4)}`}
      </span>
    </div>
  );
}
