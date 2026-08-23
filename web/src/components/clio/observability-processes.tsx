import type { AsyncProcess } from '@clio/core/v3';
import { BoxesIcon, Clock3Icon, ServerCogIcon } from 'lucide-react';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { ClioStatus } from './status';

export function ClioProcessLanes({ processes }: { processes: readonly AsyncProcess[] }) {
  const lanes = processLanes(processes);
  if (!lanes.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        No background or child-agent processes were recorded for this session.
      </p>
    );
  }

  const first = lanes[0]?.start ?? 0;
  const last = Math.max(...lanes.map((lane) => lane.end));

  return (
    <Frame spacing="sm" variant="ghost">
      <FrameHeader>
        <FrameTitle>Execution spans</FrameTitle>
        <FrameDescription>
          Observed start and update times; bars show concurrency, not completion percentage.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="grid gap-3" role="img" aria-label="Observed execution spans">
        <div className="flex justify-between gap-4 font-mono text-[10px] text-muted-foreground">
          <time dateTime={new Date(first).toISOString()}>{formatClock(first)}</time>
          <time dateTime={new Date(last).toISOString()}>{formatClock(last)}</time>
        </div>
        {lanes.map((lane) => (
          <div
            className="grid grid-cols-[minmax(7rem,0.65fr)_minmax(8rem,1fr)] gap-3"
            key={lane.id}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {lane.kind === 'agent' ? (
                  <BoxesIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <ServerCogIcon aria-hidden="true" className="size-3.5 shrink-0 text-action" />
                )}
                <span className="truncate text-xs font-medium">{lane.title}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {lane.detail}, {formatDuration(lane.end - lane.start)}
              </p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/70">
                <div
                  aria-label={`${lane.title}: ${formatDuration(lane.end - lane.start)} observed, ${lane.state}`}
                  className={laneClassName(lane.state)}
                  style={{ left: `${lane.left}%`, width: `${lane.width}%` }}
                />
              </div>
              <ClioStatus className="shrink-0 px-1.5 py-0.5 text-[10px]" value={lane.state} />
            </div>
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

interface ProcessLane {
  id: string;
  title: string;
  kind: AsyncProcess['kind'];
  state: AsyncProcess['live_state'];
  detail: string;
  start: number;
  end: number;
  left: number;
  width: number;
}

function processLanes(processes: readonly AsyncProcess[]): ProcessLane[] {
  const timed = processes
    .map((process) => {
      const start = parseTimestamp(process.created_at);
      const observedEnd = parseTimestamp(process.updated_at) ?? start;
      if (start === undefined) return undefined;
      return { process, start, end: Math.max(start, observedEnd ?? start) };
    })
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .sort((left, right) => left.start - right.start);
  if (!timed.length) return [];

  const earliest = Math.min(...timed.map((row) => row.start));
  const latest = Math.max(...timed.map((row) => row.end));
  const span = Math.max(1, latest - earliest);
  return timed.map(({ process, start, end }) => ({
    id: process.id,
    title: process.title,
    kind: process.kind,
    state: process.live_state,
    detail:
      process.kind === 'agent'
        ? `Child agent${process.depth === undefined ? '' : `, depth ${process.depth}`}`
        : process.host || process.placement || 'Background task',
    start,
    end,
    left: ((start - earliest) / span) * 100,
    width: Math.max(2.5, (Math.max(end - start, 1) / span) * 100),
  }));
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    timestamp,
  );
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(milliseconds, 0)} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  return `${Math.round(milliseconds / 60_000)} min`;
}

function laneClassName(state: AsyncProcess['live_state']): string {
  const tone =
    state === 'completed'
      ? 'bg-success/70'
      : state === 'failed'
        ? 'bg-destructive/70'
        : state === 'running'
          ? 'bg-info/75'
          : state === 'waiting_permission' || state === 'waiting_user'
            ? 'bg-action/75'
            : 'bg-muted-foreground/45';
  return `absolute top-1 bottom-1 rounded-sm ${tone}`;
}

export function ProcessSummary({ processes }: { processes: readonly AsyncProcess[] }) {
  const active = processes.filter((process) =>
    ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(process.live_state),
  ).length;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Clock3Icon aria-hidden="true" className="size-3.5" />
      <span>{processes.length.toLocaleString()} observed processes</span>
      <span aria-hidden="true">—</span>
      <span>{active ? `${active} active` : 'all settled'}</span>
    </div>
  );
}
