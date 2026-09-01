import type { RunState, StreamState } from '@clio/core/v3';
import { AlertTriangleIcon, BoxesIcon, ChevronUpIcon, ServerIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ClioStatus } from './status';

export function WorkspaceUnavailable({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <Alert className="max-w-xl" variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle>Workspace unavailable</AlertTitle>
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
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="grid justify-items-center gap-3 text-center">
        <ClioStatus label={label} value="connecting" />
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}

export function WorkspaceStatusStrip({
  activeWorkCount,
  cost,
  cursor,
  inputTokens,
  service,
  sessionState,
  stream,
  streamError,
  a2uiVersions = [],
  gactVersions = [],
}: {
  activeWorkCount: number;
  a2uiVersions?: readonly string[];
  cost?: number;
  cursor?: string;
  gactVersions?: readonly string[];
  inputTokens?: number;
  service?: { name: string; version: string };
  sessionState?: RunState;
  stream: StreamState;
  streamError?: string;
}) {
  const activeWorkLabel =
    sessionState === 'running'
      ? `Agent running${activeWorkCount ? ` with ${activeWorkCount} active item${activeWorkCount === 1 ? '' : 's'}` : ''}`
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
      <ClioStatus className="py-0.5" detail={streamError} value={stream} />
      {recoveryLabel ? <span title={recoveryDetail}>{recoveryLabel}</span> : null}
      <span>{activeWorkLabel}</span>
      <WorkspaceVersionMenu
        a2uiVersions={a2uiVersions}
        gactVersions={gactVersions}
        service={service}
      />
      {stream === 'live' ? (
        <ClioStatus
          className="hidden py-0.5 sm:inline-flex"
          detail="The latest session updates are synchronized"
          label="Up to date"
          value="completed"
        />
      ) : null}
      <span className="ml-auto hidden font-mono sm:inline">
        Tokens: {inputTokens ?? 'Unavailable'}
      </span>
      <span className="hidden font-mono sm:inline">
        Cost: {cost === undefined ? 'Unavailable' : `$${cost.toFixed(4)}`}
      </span>
    </div>
  );
}

function WorkspaceVersionMenu({
  a2uiVersions,
  gactVersions,
  service,
}: {
  a2uiVersions: readonly string[];
  gactVersions: readonly string[];
  service?: { name: string; version: string };
}) {
  const workspaceVersion = import.meta.env.VITE_CLIO_WORKSPACE_VERSION || 'Unavailable';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Product versions and updates"
          className="h-6 gap-1 px-1.5 font-mono text-[10px] text-muted-foreground"
          size="xs"
          variant="ghost"
        >
          v{workspaceVersion}
          <ChevronUpIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" side="top">
        <PopoverHeader>
          <PopoverTitle>Product versions</PopoverTitle>
          <PopoverDescription>
            Installed workspace and versions reported by the selected agent service.
          </PopoverDescription>
        </PopoverHeader>
        <dl className="grid gap-1">
          <VersionRow
            detail="Installed web and desktop workspace"
            icon={<BoxesIcon aria-hidden="true" />}
            label="Workspace"
            value={workspaceVersion}
          />
          <VersionRow
            detail={service ? 'Reported by the selected endpoint' : 'Not reported by this endpoint'}
            icon={<ServerIcon aria-hidden="true" />}
            label="Agent service"
            value={service?.version || 'Unavailable'}
          />
          <VersionRow
            detail="Negotiated agent interface"
            label="Agent interface"
            value={gactVersions[0] || 'Unavailable'}
          />
          <VersionRow
            detail="Negotiated interactive-view protocol"
            label="Interactive views"
            value={a2uiVersions[0] || 'Unavailable'}
          />
        </dl>
        <Separator />
        <Button asChild className="w-full" size="sm" variant="outline">
          <Link to="/settings/desktop">Update options</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function VersionRow({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <dt className="flex min-w-0 items-center gap-2 font-medium">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="font-mono text-xs">{value}</dd>
      <dd className="col-span-2 text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}
