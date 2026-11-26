import { t } from '@lingui/core/macro';
import { MonitorIcon, PackageIcon } from 'lucide-react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { Fragment, type ReactNode } from 'react';
import { formatDuration } from '@/lib/format';
import {
  componentShape,
  type JobAdvisory,
  type JobComponent,
  type JobCoupling,
  type JobSnapshot,
} from '@/lib/job-snapshot';
import { formatList } from '@/lib/locale-format';
import { Button } from '@/components/ui/button';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';
import type { RunRow } from '@/routes/runs-rows';
import { RunProgressBar, RunStateWord, RunStatusMark } from './run-list-row';
import { runStateLabel } from './run-presentation';
import { TechnicalDetails } from './technical-details';

/** Nodes a stack draws one by one; a larger component draws three, a gap and its front node. */
const DRAWN_NODES = 3;
/** Depth of the plain gap between a large component's front node and the three behind it. */
const GAP_SLOTS = 2;

type RunState = RunRow['state'];

/**
 * A job's state in the words and marks of a run row: a ring while it waits in
 * the queue, the spinner while it runs, ✓ done, a red ⚠ when it failed or ran
 * out of time, × when cancelled or declined. `detail` says what it waits on or
 * why it ended. A planned job has none; the ask that carries it speaks for it.
 */
function jobRunState(job: JobSnapshot): { state: RunState; detail?: string } | null {
  switch (job.phase) {
    case 'planned':
      return null;
    case 'submitted':
      return { state: 'queued', detail: t`Submitted, waiting for the scheduler` };
    case 'queued':
      return { state: 'queued', detail: queueDetail(job) };
    case 'running':
      return { state: 'running' };
    case 'ending':
      return { state: 'running', detail: t`Finishing` };
    case 'ended':
      switch (job.outcome) {
        case 'succeeded':
          return { state: 'completed' };
        case 'failed':
          return { state: 'failed' };
        case 'cancelled':
          return { state: 'cancelled' };
        // The person said no to the job's ask, so nothing was submitted.
        case 'declined':
          return { state: 'cancelled', detail: t`You declined` };
        case 'timed_out':
          return { state: 'failed', detail: t`Ran out of time` };
        case PAST_LIMIT:
          return { state: 'failed', detail: t`Time limit passed` };
        default:
          return { state: 'stopped' };
      }
    default:
      return null;
  }
}

/** What a queued job waits on: the scheduler's reason and its place in the queue. */
function queueDetail(job: JobSnapshot): string | undefined {
  const reason = job.queue?.reason?.trim();
  const position = job.queue?.position;
  if (reason && position) return t`Waiting on ${reason}, position ${position}`;
  if (reason) return t`Waiting on ${reason}`;
  if (position) return t`Position ${position} in the queue`;
  return undefined;
}

/** A component's own state as a run state, so its mark is a run row's. */
function componentRunState(state: string | null | undefined): RunState | null {
  switch (state) {
    case 'waiting':
      return 'queued';
    case 'starting':
    case 'running':
      return 'running';
    case 'done':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

/** A component's state line: the run row's mark beside the words. */
function ComponentState({ component }: { component: JobComponent }) {
  const label = componentStateLabel(component);
  const state = componentRunState(component.state);
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-meta text-muted-foreground',
        state === 'running' && 'text-accent-foreground',
        state === 'failed' && 'text-destructive-text',
      )}
    >
      {state ? <RunStatusMark cancelRequested={false} className="size-3" row={{ state }} /> : null}
      {label}
    </span>
  );
}

/**
 * What the card is called: the job's own name, else what its components are
 * (an install names its package), else what kind of job it is, else where it runs.
 */
function jobTitle(job: JobSnapshot): string {
  if (job.label?.trim()) return job.label.trim();
  const only = job.components.length === 1 ? job.components[0] : undefined;
  if (only) {
    const name = componentName(only);
    return componentShape(only) === 'install' ? t`${name} install` : name;
  }
  if (job.components.length) return formatList(job.components.map(componentName));
  if (job.kind === 'install') return t`Software install`;
  const site = job.site?.label || job.site?.id;
  return site ? t`Job on ${site}` : t`Scheduler job`;
}

/**
 * Counted progress of the job's current step: the task's own counts, else the
 * "41 of 112" its step text names. Whole percent, or undefined.
 */
function stepPercent(job: JobSnapshot): { percent: number; counted?: string } | undefined {
  let completed = job.progress?.completed;
  let total = job.progress?.total;
  let counted: string | undefined;
  if (completed != null && total != null) {
    counted = t`${completed} of ${total}`;
  } else {
    const named = job.step ? /\b(\d+)\s+(?:of|\/)\s+(\d+)\b/u.exec(job.step) : null;
    if (!named) return undefined;
    completed = Number(named[1]);
    total = Number(named[2]);
  }
  if (!total || total <= 0) return undefined;
  const percent = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  return { percent, counted };
}

function componentStateLabel(component: JobComponent): string | null {
  const nodes = component.nodes ?? 0;
  const running = component.nodes_running ?? 0;
  switch (component.state) {
    case 'planned':
      // The planned shape is the stack and its count; a line would only repeat them.
      return null;
    case 'waiting':
      return t`Waiting for nodes`;
    case 'starting':
      return t`Starting`;
    case 'running':
      return nodes > 1 && running > 0 && running < nodes
        ? t`${running} of ${nodes} running`
        : t`Running`;
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

type NodeLook = 'planned' | 'allocated' | 'running' | 'done' | 'failed';

/** The nodes a stack draws, front first, each with the state it shows. */
function drawnNodes(component: JobComponent, phase: string): NodeLook[] {
  const nodes = Math.max(1, component.nodes ?? 1);
  const drawn = nodes > DRAWN_NODES ? DRAWN_NODES + 1 : nodes;
  if (component.state === 'failed') return Array.from({ length: drawn }, () => 'failed');
  if (component.state === 'done') return Array.from({ length: drawn }, () => 'done');
  const over = phase === 'ended';
  const running = over ? 0 : Math.min(nodes, component.nodes_running ?? 0);
  const allocated = over ? 0 : Math.min(nodes, Math.max(running, component.nodes_allocated ?? 0));
  const share = (count: number) => (count >= nodes ? drawn : Math.round((count / nodes) * drawn));
  const runningDrawn = share(running);
  const allocatedDrawn = share(allocated);
  return Array.from({ length: drawn }, (_, index) =>
    index < runningDrawn ? 'running' : index < allocatedDrawn ? 'allocated' : 'planned',
  );
}

const NODE_LOOK: Record<NodeLook, string> = {
  planned: 'border-foreground/45',
  allocated: 'border-info/70',
  running: 'border-info',
  done: 'border-success/60',
  failed: 'border-destructive/70',
};

const NODE_TINT: Record<NodeLook, string> = {
  planned: '',
  allocated: 'bg-info/10',
  running: 'bg-info/25',
  done: 'bg-success/15',
  failed: 'bg-destructive/20',
};

interface StackGeometry {
  width: number;
  height: number;
  stepX: number;
  stepY: number;
  box: string;
}

const NODE_GEOMETRY: StackGeometry = {
  width: 88,
  height: 48,
  stepX: 10,
  stepY: 8,
  box: 'rounded-sm',
};

const SERVICE_GEOMETRY: StackGeometry = {
  width: 72,
  height: 60,
  stepX: 13,
  stepY: 3,
  box: 'rounded-md origin-bottom-left [transform:rotateY(-28deg)_skewY(-4deg)]',
};

/**
 * A component's nodes as a parallax stack, one outline per node: up to three
 * drawn one by one, a larger component as three, a plain gap and its front
 * node, the name's count saying how many there are.
 */
function NodeStack({
  component,
  phase,
  shape,
}: {
  component: JobComponent;
  phase: string;
  shape: 'nodes' | 'service' | 'install';
}) {
  const looks = drawnNodes(component, phase);
  const gap = looks.length > DRAWN_NODES;
  const geometry = shape === 'service' ? SERVICE_GEOMETRY : NODE_GEOMETRY;
  // Depth slots from the front: the front node, then a plain gap when there is one.
  const slots = looks.map((_, index) => (gap && index > 0 ? index + GAP_SLOTS : index));
  const depth = slots[slots.length - 1] ?? 0;
  const width = geometry.width + depth * geometry.stepX;
  const height = geometry.height + depth * geometry.stepY;
  const Icon = shape === 'service' ? MonitorIcon : shape === 'install' ? PackageIcon : null;
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block shrink-0', shape === 'service' && '[perspective:240px]')}
      data-drawn-nodes={looks.length}
      style={{ width, height }}
    >
      {looks
        .map((look, index) => ({ look, index, slot: slots[index] ?? index }))
        .reverse()
        .map(({ look, index, slot }) => (
          <span
            className={cn(
              'absolute flex items-center justify-center overflow-hidden border bg-background',
              geometry.box,
              NODE_LOOK[look],
            )}
            data-node={look}
            key={index}
            style={{
              left: slot * geometry.stepX,
              top: (depth - slot) * geometry.stepY,
              width: geometry.width,
              height: geometry.height,
            }}
          >
            <span className={cn('absolute inset-0', NODE_TINT[look])} />
            {index === 0 && Icon ? (
              <Icon className="relative size-4 text-muted-foreground" />
            ) : null}
          </span>
        ))}
    </span>
  );
}

function ComponentBlock({
  component,
  phase,
  placed,
}: {
  component: JobComponent;
  phase: string;
  /** Whether the job has several components, so where each runs tells them apart. */
  placed: boolean;
}) {
  const nodes = component.nodes ?? null;
  const hosts = component.hosts?.length ? component.hosts.join(', ') : undefined;
  const name = componentName(component);
  const shape = componentShape(component);
  // One node is one outline; the count only speaks for a larger stack.
  const counted = nodes != null && nodes > 1;
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-1 text-center"
      data-component-id={component.id}
      data-component-state={component.state ?? undefined}
      data-slot="job-component"
      title={hosts}
    >
      <NodeStack component={component} phase={phase} shape={shape} />
      <span className="line-clamp-2 max-w-44 font-medium break-words text-foreground">
        {counted ? t`${name} ×${nodes}` : name}
      </span>
      <ComponentState component={component} />
      {placed && component.host_slice ? (
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

/** A scheduler fact the job leaves to the site's own default. */
function SiteDefault() {
  return <span className="font-sans text-muted-foreground">{t`site default`}</span>;
}

/** A wall time as the scheduler states it: whole hours and minutes, seconds only when short. */
function wallTime(milliseconds: number): string {
  // Clocks on the site and here differ a little; `wall` never shows a start ahead of now.
  return formatDuration(milliseconds, 'wall');
}

/**
 * Slack past a job's limit before the card stops calling it running: the
 * scheduler ends it at the limit, and the site's update can take a minute or
 * two to arrive.
 */
const LIMIT_GRACE_MS = 2 * 60_000;
/** The outcome a card draws when the limit passed and no end was reported. */
const PAST_LIMIT = 'past_limit';

/** When a running job is past its limit for sure, or null without a start and a limit. */
function limitEndsAt(job: JobSnapshot): number | null {
  if (job.time_limit_s == null || !job.started_at) return null;
  const started = Date.parse(job.started_at);
  return Number.isNaN(started) ? null : started + job.time_limit_s * 1000 + LIMIT_GRACE_MS;
}

/**
 * A job the scheduler must have ended, since its limit passed, whose end has
 * not arrived: drawn ended at its limit, with no outcome claimed and no node
 * still running.
 */
function pastLimit(job: JobSnapshot, endsAt: number): JobSnapshot {
  return {
    ...job,
    phase: 'ended',
    outcome: PAST_LIMIT,
    ended_at: new Date(endsAt - LIMIT_GRACE_MS).toISOString(),
    step: null,
    components: job.components.map((component) =>
      component.state === 'done' || component.state === 'failed' || component.state === 'cancelled'
        ? component
        : { ...component, state: null, nodes_running: 0, nodes_allocated: 0 },
    ),
  };
}

function timeFact(job: JobSnapshot, now: number): string | null {
  const limit = job.time_limit_s != null ? wallTime(job.time_limit_s * 1000) : null;
  // Relay stamps started_at when the operation starts; the job's clock runs only once it runs.
  const ran = job.phase === 'running' || job.phase === 'ending' || job.phase === 'ended';
  const started = ran && job.started_at ? Date.parse(job.started_at) : Number.NaN;
  if (Number.isNaN(started)) return limit;
  const end = job.ended_at ? Date.parse(job.ended_at) : now;
  let spent = Math.max(0, end - started);
  // The scheduler stops a job at its limit; a late or early stamp must not count past it.
  if (job.time_limit_s != null) spent = Math.min(spent, job.time_limit_s * 1000);
  const elapsed = wallTime(spent);
  return limit ? t`${elapsed} of ${limit}` : elapsed;
}

/**
 * JARVIS's notes on its plan, shown as proposals: what it chose, what breaks if
 * that is wrong and the command that settles it. They never hold the job.
 */
function JobAdvisories({ advisories }: { advisories: JobAdvisory[] }) {
  return (
    <ul
      aria-label={t`JARVIS notes`}
      className="flex min-w-0 flex-col gap-1.5"
      data-slot="job-advisories"
    >
      {advisories.map((advisory, index) => {
        const remedy =
          advisory.remedy && advisory.issue_id
            ? advisory.remedy.replaceAll('<issue_id>', advisory.issue_id)
            : advisory.remedy;
        return (
          <li
            className="flex min-w-0 items-start gap-1.5 text-meta"
            data-advisory-kind={advisory.kind ?? undefined}
            data-slot="job-advisory"
            key={advisory.issue_id ?? index}
          >
            <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-info" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-foreground">{advisory.message}</span>
              {advisory.consequence_if_wrong.length || remedy ? (
                <TechnicalDetails
                  className="flex flex-col items-start"
                  contentClassName="mt-1 flex flex-col gap-1.5 self-stretch"
                  summaryClassName="text-meta"
                  title={t`If this is wrong`}
                >
                  {advisory.consequence_if_wrong.map((consequence) => (
                    <p className="text-muted-foreground" key={consequence}>
                      {consequence}
                    </p>
                  ))}
                  {remedy ? (
                    <pre className="clio-scrollbar overflow-auto rounded-md bg-muted/50 p-2 font-mono whitespace-pre-wrap wrap-anywhere text-foreground">
                      {remedy}
                    </pre>
                  ) : null}
                </TechnicalDetails>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface JobCardProps {
  job: JobSnapshot;
  /** What "Show details" opens when the snapshot has no script (the ask's own text). */
  fallback?: ReactNode;
  className?: string;
  /** Open the run this job belongs to: its record, with the log and what it asked. */
  onOpen?: () => void;
  /** Actions shown on hover beside the state, as on a run row (Retry). */
  actions?: ReactNode;
}

/**
 * A scheduler job drawn as its pipeline: the allocation's facts above a dashed
 * box, each component as a stack of its nodes, the couplings as arrows, and
 * the batch script one disclosure away. The same card is the planned job in an
 * ask, the running job in a transcript and a row in a job list.
 */
export function JobCard({ job: reported, fallback, className, onOpen, actions }: JobCardProps) {
  const live = reported.phase === 'running' || reported.phase === 'ending';
  const limitEnd = live ? limitEndsAt(reported) : null;
  const now = useNow(live && Boolean(reported.started_at));
  const job = limitEnd !== null && now >= limitEnd ? pastLimit(reported, limitEnd) : reported;
  const time = timeFact(job, now);
  const site = job.site?.label || job.site?.id;
  const run = jobRunState(job);
  const name = jobTitle(job);
  const progress = stepPercent(job);
  return (
    <section
      aria-label={site ? t`Job on ${site}` : t`Job`}
      className={cn('group/job @container/job flex min-w-0 flex-col gap-2 text-menu', className)}
      data-job-operation={job.operation_id}
      data-job-phase={job.phase}
      data-job-revision={job.revision}
      data-slot="job-card"
    >
      {/* A planned job has no state yet; the ask that carries it names it. */}
      {run ? (
        <div className="flex min-w-0 items-start gap-2" data-slot="job-head">
          <RunStatusMark cancelRequested={false} className="mt-[3px]" row={{ state: run.state }} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground" title={name}>
              {name}
            </span>
            {run.detail ? (
              <span
                className={cn(
                  'text-meta wrap-anywhere text-muted-foreground',
                  run.state === 'failed' && 'text-destructive-text',
                )}
                data-slot="job-state-detail"
              >
                {run.detail}
              </span>
            ) : null}
          </div>
          <span
            className="shrink-0 text-caption whitespace-nowrap text-muted-foreground tabular-nums"
            data-job-state={run.state}
            data-slot="job-status"
          >
            <RunStateWord
              row={{
                state: run.state,
                createdAt: job.started_at ?? undefined,
                terminalAt: job.ended_at ?? undefined,
                host: site ?? '',
                source: 'mcp_task',
              }}
              stateLabel={runStateLabel({ state: run.state }, false)}
            />
          </span>
          {actions ? (
            <span
              className="-my-0.5 flex shrink-0 items-center opacity-0 group-focus-within/job:opacity-100 group-hover/job:opacity-100 pointer-coarse:opacity-100"
              data-slot="job-actions"
            >
              {actions}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        {job.partition || job.scheduler ? (
          <Fact label={t`Partition`} value={job.partition || <SiteDefault />} />
        ) : null}
        {job.account || job.scheduler ? (
          <Fact label={t`Account`} value={job.account || <SiteDefault />} />
        ) : null}
        {time ? (
          <Fact label={t({ message: 'Time', context: 'job wall time' })} value={time} />
        ) : null}
      </div>
      {job.components.length === 1 && !job.couplings.length && job.components[0] ? (
        // Its nodes drawn straight in the card: no data flow to frame, and never a
        // box inside the card's box (#66).
        <div className="flex min-w-0 justify-center py-1" data-slot="job-pipeline" data-single="">
          <ComponentBlock component={job.components[0]} phase={job.phase} placed={false} />
        </div>
      ) : job.components.length ? (
        <div
          className="flex min-w-0 flex-wrap items-start justify-center gap-3 rounded-lg border border-dashed border-foreground/35 px-3 py-3 @max-[420px]/job:flex-col @max-[420px]/job:items-center"
          data-slot="job-pipeline"
        >
          {orderedComponents(job).map(({ component, coupling }) => (
            <Fragment key={component.id}>
              {coupling !== undefined ? <CouplingArrow coupling={coupling} /> : null}
              <ComponentBlock
                component={component}
                phase={job.phase}
                placed={job.components.length > 1}
              />
            </Fragment>
          ))}
        </div>
      ) : job.step ? (
        <div className="flex min-w-0 flex-col gap-1.5" data-slot="job-step">
          <p className="min-w-0 wrap-anywhere text-foreground">
            <span className="mr-1.5 text-meta text-muted-foreground">{t`Current step`}</span>
            {job.step}
          </p>
          {progress ? (
            <span className="flex min-w-0 items-center gap-2">
              <RunProgressBar className="flex-1" percent={progress.percent} />
              {progress.counted ? (
                <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                  {progress.counted}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {site || job.job_id != null || onOpen ? (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-meta">
          {site ? <Fact label={t`Site`} value={site} /> : null}
          {job.job_id != null ? <Fact label={t`Job`} value={String(job.job_id)} /> : null}
          {job.phase === 'queued' && job.queue?.starts_in_s != null ? (
            <Fact label={t`Starts in`} value={wallTime(job.queue.starts_in_s * 1000)} />
          ) : null}
          {onOpen ? (
            <Button
              className="ml-auto h-auto p-0 text-meta font-medium text-accent-foreground underline decoration-primary/45 underline-offset-[3px]"
              data-slot="job-open-run"
              onClick={onOpen}
              variant="link"
            >
              {t`Open run`}
            </Button>
          ) : null}
        </div>
      ) : null}
      {job.advisories.length ? <JobAdvisories advisories={job.advisories} /> : null}
      {job.script?.text || fallback ? (
        <TechnicalDetails
          className="flex flex-col items-start"
          contentClassName="mt-2 self-stretch"
          summaryClassName="text-meta"
          title={job.script?.text ? t`See script` : t`Show details`}
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
