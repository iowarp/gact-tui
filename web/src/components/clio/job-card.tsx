import { plural, t } from '@lingui/core/macro';
import { MonitorIcon, PackageIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { formatDuration } from '@/lib/format';
import {
  componentShape,
  componentTone,
  jobTone,
  type JobComponent,
  type JobCoupling,
  type JobSnapshot,
  type JobStatusTone,
} from '@/lib/job-snapshot';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';
import { TechnicalDetails } from './technical-details';

const TONE_TEXT: Record<JobStatusTone, string> = {
  neutral: 'text-muted-foreground',
  waiting: 'text-warning',
  active: 'text-info',
  good: 'text-success',
  bad: 'text-destructive-text',
};

const TONE_DOT: Record<JobStatusTone, string> = {
  neutral: 'bg-muted-foreground/50',
  waiting: 'bg-warning',
  active: 'bg-info animate-pulse',
  good: 'bg-success',
  bad: 'bg-destructive',
};

/** Cells a node stack draws, at most; a larger job shares nodes between cells. */
const MAX_CELLS = 16;

function jobStatusLabel(job: JobSnapshot): string {
  switch (job.phase) {
    case 'planned':
      return t`Planned`;
    case 'submitted':
      return t`Submitted`;
    case 'queued': {
      const position = job.queue?.position;
      return position ? t`Queued, position ${position}` : t`Queued`;
    }
    case 'running':
      return t`Running`;
    case 'ending':
      return t`Finishing`;
    case 'ended':
      switch (job.outcome) {
        case 'succeeded':
          return t`Finished`;
        case 'failed':
          return t`Failed`;
        case 'cancelled':
          return t`Cancelled`;
        case 'timed_out':
          return t`Ran out of time`;
        default:
          return t`Ended`;
      }
    default:
      return job.phase;
  }
}

function componentStateLabel(component: JobComponent): string | null {
  const nodes = component.nodes ?? 0;
  const allocated = component.nodes_allocated ?? 0;
  const running = component.nodes_running ?? 0;
  switch (component.state) {
    case 'planned':
      return nodes ? plural(nodes, { one: 'Will use # node', other: 'Will use # nodes' }) : null;
    case 'waiting':
      return t`Waiting for nodes`;
    case 'starting':
      return nodes
        ? plural(nodes, {
            one: `Starting on ${allocated} of # node`,
            other: `Starting on ${allocated} of # nodes`,
          })
        : t`Starting`;
    case 'running':
      if (!nodes || running >= nodes) {
        const count = running || nodes;
        return plural(count, { one: 'Running on # node', other: 'Running on # nodes' });
      }
      return plural(nodes, {
        one: `Running on ${running} of # node`,
        other: `Running on ${running} of # nodes`,
      });
    case 'done':
      return t`Done`;
    case 'failed':
      return t`Failed`;
    case 'cancelled':
      return t`Cancelled`;
    default:
      return null;
  }
}

function componentName(component: JobComponent): string {
  return component.label || component.id;
}

/** How many of a component's cells are running, and how many hold an allocated node. */
function cellCounts(component: JobComponent, phase: string) {
  const nodes = Math.max(1, component.nodes ?? 1);
  const cells = Math.min(nodes, MAX_CELLS);
  const done = component.state === 'done';
  const running = done || phase === 'ended' ? 0 : Math.min(nodes, component.nodes_running ?? 0);
  const allocated =
    done || phase === 'ended'
      ? 0
      : Math.min(nodes, Math.max(running, component.nodes_allocated ?? 0));
  return {
    cells,
    running: Math.round((running / nodes) * cells),
    allocated: Math.round((allocated / nodes) * cells),
    done,
  };
}

function NodeCells({ component, phase }: { component: JobComponent; phase: string }) {
  const { cells, running, allocated, done } = cellCounts(component, phase);
  const failed = component.state === 'failed';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid gap-[3px]',
        cells > 8 ? 'grid-cols-8' : cells > 4 ? 'grid-cols-4' : 'grid-cols-2',
      )}
    >
      {Array.from({ length: cells }, (_, index) => (
        <span
          className={cn(
            'size-2 rounded-[2px] border',
            failed
              ? 'border-destructive/60 bg-destructive/30'
              : done
                ? 'border-success/50 bg-success/40'
                : index < running
                  ? 'border-info bg-info'
                  : index < allocated
                    ? 'border-info/70 bg-info/25'
                    : 'border-foreground/25',
          )}
          data-cell={index < running ? 'running' : index < allocated ? 'allocated' : 'planned'}
          key={index}
        />
      ))}
    </span>
  );
}

/** Compute nodes: three staggered outlines, the front one holding the node cells. */
function NodeStack({
  component,
  phase,
  install = false,
}: {
  component: JobComponent;
  phase: string;
  /** A software install: a package over the cells of the node it builds on. */
  install?: boolean;
}) {
  return (
    <span aria-hidden="true" className="relative inline-block h-20 w-32 shrink-0">
      <span className="absolute top-0 left-6 h-14 w-26 rounded-sm border border-foreground/25 bg-background" />
      <span className="absolute top-3 left-3 h-14 w-26 rounded-sm border border-foreground/35 bg-background" />
      <span className="absolute top-6 left-0 flex h-14 w-26 flex-col items-center justify-center gap-1 rounded-sm border border-foreground/50 bg-background">
        {install ? <PackageIcon className="size-4 text-muted-foreground" /> : null}
        <NodeCells component={component} phase={phase} />
      </span>
    </span>
  );
}

/** A viewer: a fanned stack of cards, the front one a screen holding its node cells. */
function CardStack({ component, phase }: { component: JobComponent; phase: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block h-20 w-32 shrink-0 [perspective:240px]"
    >
      <span className="absolute top-1 left-12 h-16 w-18 origin-bottom-left [transform:rotateY(-28deg)_skewY(-4deg)] rounded-md border border-foreground/25 bg-background" />
      <span className="absolute top-2 left-7 h-16 w-18 origin-bottom-left [transform:rotateY(-28deg)_skewY(-4deg)] rounded-md border border-foreground/35 bg-background" />
      <span className="absolute top-3 left-2 flex h-16 w-18 origin-bottom-left [transform:rotateY(-28deg)_skewY(-4deg)] flex-col items-center justify-center gap-1 rounded-md border border-foreground/50 bg-background">
        <MonitorIcon className="size-4 text-muted-foreground" />
        <NodeCells component={component} phase={phase} />
      </span>
    </span>
  );
}

function ComponentBlock({ component, phase }: { component: JobComponent; phase: string }) {
  const nodes = component.nodes ?? null;
  const state = componentStateLabel(component);
  const tone = componentTone(component.state);
  const hosts = component.hosts?.length ? component.hosts.join(', ') : undefined;
  const name = componentName(component);
  const shape = componentShape(component);
  // One install on one node is just the install; a count only helps a wider one.
  const counted = nodes && (shape !== 'install' || nodes > 1);
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-1 text-center"
      data-component-id={component.id}
      data-component-state={component.state ?? undefined}
      data-slot="job-component"
      title={hosts}
    >
      {shape === 'service' ? (
        <CardStack component={component} phase={phase} />
      ) : (
        <NodeStack component={component} install={shape === 'install'} phase={phase} />
      )}
      <span className="line-clamp-2 max-w-44 font-medium break-words text-foreground">
        {counted ? t`${name} ×${nodes}` : name}
      </span>
      {state ? (
        <span className={cn('inline-flex items-center gap-1 text-meta', TONE_TEXT[tone])}>
          <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
          {state}
        </span>
      ) : null}
      {component.host_slice ? (
        <span className="max-w-40 truncate text-meta text-muted-foreground">
          {hostSlice(component.host_slice)}
        </span>
      ) : null}
    </div>
  );
}

/** JARVIS's host slice (`start:end`, end exclusive) as the nodes it names, counted from 1. */
function hostSlice(slice: string): string {
  const range = /^(\d+):(\d+)$/.exec(slice.trim());
  if (!range) return slice;
  const first = Number(range[1]) + 1;
  const last = Number(range[2]);
  return first === last ? t`Node ${first}` : t`Nodes ${first} to ${last}`;
}

function couplingLabel(coupling: JobCoupling): string {
  if (coupling.label) return coupling.label;
  return coupling.kind === 'stream' ? t`Streams to` : t`Feeds`;
}

/** The coupling between two neighbours: an arrow with its label; it points down when narrow. */
function CouplingArrow({ coupling }: { coupling: JobCoupling | null }) {
  const dash = coupling ? undefined : '3 3';
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1 self-center text-muted-foreground @max-[420px]/job:flex-row @max-[420px]/job:gap-2"
      data-slot="job-coupling"
    >
      <svg
        aria-hidden="true"
        className="h-3 w-24 @max-[420px]/job:hidden"
        fill="none"
        viewBox="0 0 64 12"
      >
        <path
          d="M2 6h56m-6-5 6 5-6 5"
          stroke="currentColor"
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="hidden h-10 w-3 @max-[420px]/job:block"
        fill="none"
        viewBox="0 0 12 40"
      >
        <path
          d="M6 2v34m-5-6 5 6 5-6"
          stroke="currentColor"
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      {coupling ? (
        <span className="max-w-24 truncate text-meta">{couplingLabel(coupling)}</span>
      ) : null}
    </div>
  );
}

/** Components in pipeline order, each with the coupling that leads to it from the one before. */
function orderedComponents(job: JobSnapshot) {
  const components = job.components;
  return components.map((component, index) => {
    const previous = index > 0 ? components[index - 1] : undefined;
    const coupling =
      previous &&
      (job.couplings.find((link) => link.from === previous.id && link.to === component.id) ??
        job.couplings.find((link) => link.from === component.id && link.to === previous.id));
    return { component, coupling: previous ? (coupling ?? null) : undefined };
  });
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5" data-slot="job-fact">
      <span className="text-meta text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-foreground">{value}</span>
    </span>
  );
}

/** A wall time as the scheduler states it: whole hours and minutes, seconds only when short. */
function wallTime(milliseconds: number): string {
  // Clocks on the site and here differ a little; never show a start ahead of now.
  if (milliseconds < 1000) return '0 s';
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return formatDuration(Math.floor(milliseconds / 1000) * 1000);
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

function timeFact(job: JobSnapshot, now: number): string | null {
  const limit = job.time_limit_s != null ? wallTime(job.time_limit_s * 1000) : null;
  const started = job.started_at ? Date.parse(job.started_at) : Number.NaN;
  if (Number.isNaN(started)) return limit;
  const end = job.ended_at ? Date.parse(job.ended_at) : now;
  const elapsed = wallTime(Math.max(0, end - started));
  return limit ? t`${elapsed} of ${limit}` : elapsed;
}

export interface JobCardProps {
  job: JobSnapshot;
  /** What "See script" opens when the snapshot has no script (the ask's own text). */
  fallback?: ReactNode;
  className?: string;
}

/**
 * A scheduler job drawn as its pipeline: the allocation's facts above a dashed
 * box, each component as a stack of its nodes, the couplings as arrows, and
 * the batch script one disclosure away. The same card is the planned job in an
 * ask, the running job in a transcript and a row in a job list.
 */
export function JobCard({ job, fallback, className }: JobCardProps) {
  const live = job.phase === 'running' || job.phase === 'ending';
  const now = useNow(live && Boolean(job.started_at));
  const tone = jobTone(job);
  const time = timeFact(job, now);
  const site = job.site?.label || job.site?.id;
  return (
    <section
      aria-label={site ? t`Job on ${site}` : t`Job`}
      className={cn('@container/job flex min-w-0 flex-col gap-2 text-menu', className)}
      data-job-operation={job.operation_id}
      data-job-phase={job.phase}
      data-job-revision={job.revision}
      data-slot="job-card"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        {job.partition ? <Fact label={t`Partition`} value={job.partition} /> : null}
        {job.account ? <Fact label={t`Account`} value={job.account} /> : null}
        {time ? (
          <Fact label={t({ message: 'Time', context: 'job wall time' })} value={time} />
        ) : null}
        <span
          className={cn('ml-auto inline-flex items-center gap-1.5 font-medium', TONE_TEXT[tone])}
          data-slot="job-status"
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', TONE_DOT[tone])} />
          {jobStatusLabel(job)}
        </span>
      </div>
      <div
        className="flex min-w-0 flex-wrap items-start justify-center gap-3 rounded-lg border border-dashed border-foreground/35 px-3 py-3 @max-[420px]/job:flex-col @max-[420px]/job:items-center"
        data-slot="job-pipeline"
      >
        {job.components.length ? (
          orderedComponents(job).map(({ component, coupling }) => (
            <Fragment key={component.id}>
              {coupling !== undefined ? <CouplingArrow coupling={coupling} /> : null}
              <ComponentBlock component={component} phase={job.phase} />
            </Fragment>
          ))
        ) : (
          <span className="text-muted-foreground">{t`No components described`}</span>
        )}
      </div>
      {site || job.job_id != null ? (
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-meta">
          {site ? <Fact label={t`Site`} value={site} /> : null}
          {job.job_id != null ? <Fact label={t`Job`} value={String(job.job_id)} /> : null}
          {job.phase === 'queued' && job.queue?.reason ? (
            <Fact label={t`Queue reason`} value={job.queue.reason} />
          ) : null}
        </div>
      ) : null}
      {job.script?.text || fallback ? (
        <TechnicalDetails
          className="flex flex-col items-start"
          contentClassName="mt-2 self-stretch"
          summaryClassName="text-meta"
          title={t`See script`}
        >
          {job.script?.text ? (
            <pre
              className="clio-scrollbar max-h-72 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-meta whitespace-pre text-foreground"
              data-slot="job-script"
            >
              {job.script.text}
            </pre>
          ) : (
            fallback
          )}
        </TechnicalDetails>
      ) : null}
    </section>
  );
}
