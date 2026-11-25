import { z } from 'zod';

/**
 * A scheduler job as relay describes it: one full snapshot per change, keyed by
 * relay's operation id. The card reads only these typed facts and never parses
 * the batch script; when no snapshot is present, callers keep their text.
 */
export const JOB_META_KEY = 'io.iowarp.clio-relay/job';

/**
 * The resource holding one job's newest card on the server that runs it: the
 * card's own `resource`, or relay's address for a card that predates it. Relay
 * announces it updated on each change, also after the task that started the job
 * has ended, so a card read here follows the job to its end.
 */
export function jobResourceUri(job: { operation_id: string; resource?: string | null }): string {
  return job.resource || `relay://jobs/${encodeURIComponent(job.operation_id)}`;
}

/** The card a job resource read carries: its first JSON text. */
export function jobFromResource(value: { contents: Array<{ text?: string }> }): JobSnapshot | null {
  for (const content of value.contents) {
    if (typeof content.text !== 'string') continue;
    try {
      const job = readJob(JSON.parse(content.text));
      if (job) return job;
    } catch {
      // Not JSON; a later content may be.
    }
  }
  return null;
}

const optionalText = z.string().nullish().catch(null);
const optionalCount = z.number().int().nonnegative().nullish().catch(null);

const componentSchema = z.object({
  id: z.string(),
  label: z.string().nullish().catch(null),
  package: optionalText,
  role: optionalText,
  nodes: optionalCount,
  ranks: optionalCount,
  host_slice: optionalText,
  state: optionalText,
  nodes_allocated: optionalCount,
  nodes_running: optionalCount,
  hosts: z.array(z.string()).nullish().catch(null),
});

const couplingSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: optionalText,
  label: optionalText,
});

/** A note JARVIS attaches to its plan, such as a fact it guessed. It never holds the job. */
const advisorySchema = z.object({
  issue_id: optionalText,
  kind: optionalText,
  subject: optionalText,
  fact: optionalText,
  reason_codes: z.array(z.string()).catch([]),
  message: z.string().min(1),
  consequence_if_wrong: z.array(z.string()).catch([]),
  remedy: optionalText,
});

const advisoriesSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = advisorySchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

export const jobSnapshotSchema = z.object({
  version: z.number().nullish().catch(null),
  operation_id: z.string(),
  job_id: z.union([z.string(), z.number()]).nullish().catch(null),
  revision: z.number().catch(0),
  updated_at: optionalText,
  /** `jarvis` when JARVIS planned the job; `relay` when relay filled it from the spec. */
  source: optionalText,
  site: z.object({ id: z.string(), label: optionalText }).nullish().catch(null),
  scheduler: optionalText,
  phase: z.string(),
  outcome: optionalText,
  partition: optionalText,
  account: optionalText,
  qos: optionalText,
  time_limit_s: z.number().nonnegative().nullish().catch(null),
  started_at: optionalText,
  ended_at: optionalText,
  queue: z
    .object({
      reason: optionalText,
      position: optionalCount,
      /** The scheduler's estimate of when the job starts, from now. */
      starts_in_s: z.number().nonnegative().nullish().catch(null),
    })
    .nullish()
    .catch(null),
  components: z.array(componentSchema).catch([]),
  couplings: z.array(couplingSchema).catch([]),
  script: z.object({ sha256: optionalText, text: z.string() }).nullish().catch(null),
  advisories: advisoriesSchema,
  /** The resource holding this job's newest card, announced updated on each change. */
  resource: optionalText,
});

export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export type JobAdvisory = JobSnapshot['advisories'][number];
export type JobComponent = JobSnapshot['components'][number];
export type JobCoupling = JobSnapshot['couplings'][number];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readJob(value: unknown): JobSnapshot | null {
  const parsed = jobSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The job a `_meta`-like mapping carries under relay's key. */
export function jobFromMeta(meta: unknown): JobSnapshot | null {
  return readJob(record(meta)?.[JOB_META_KEY]);
}

/**
 * The planned job an ask carries. Hosts pass the elicitation's `_meta` through
 * under a few names; the first that holds a job wins.
 */
export function jobFromInteraction(payload: unknown): JobSnapshot | null {
  const root = record(payload);
  if (!root) return null;
  const metadata = record(root.metadata);
  const elicitation = record(metadata?.elicitation);
  for (const meta of [
    elicitation?.meta,
    elicitation?._meta,
    metadata?.meta,
    metadata?._meta,
    root._meta,
    root.meta,
  ]) {
    const job = jobFromMeta(meta);
    if (job) return job;
  }
  return null;
}

/**
 * Whether a job says more than its site and one step: an allocation, a script, advisories,
 * a multi-part pipeline or a multi-node step. A bare planned "Software install" tile does not.
 */
export function jobHasShape(job: JobSnapshot): boolean {
  return Boolean(
    job.job_id != null ||
      job.partition ||
      job.account ||
      job.time_limit_s != null ||
      job.script?.text ||
      job.advisories.length ||
      job.components.length > 1 ||
      job.components.some((component) => (component.nodes ?? 0) > 1),
  );
}

/** Jobs a tool result carries: `structuredContent.job` or `structuredContent.jobs[]`. */
export function jobsFromToolOutput(output: unknown): JobSnapshot[] {
  const root = record(output);
  if (!root) return [];
  const content = record(root.structuredContent) ?? record(root.structured_content) ?? root;
  const jobs: JobSnapshot[] = [];
  const single = readJob(content.job);
  if (single) jobs.push(single);
  if (Array.isArray(content.jobs)) {
    for (const entry of content.jobs) {
      const job = readJob(entry);
      if (job) jobs.push(job);
    }
  }
  const meta = jobFromMeta(content._meta) ?? jobFromMeta(root._meta);
  if (meta) jobs.push(meta);
  return jobs;
}

/** The job a task's live snapshot carries in its metadata or progress. */
export function jobFromTask(task: { metadata?: unknown; progress?: unknown }): JobSnapshot | null {
  return (
    jobFromMeta(task.metadata) ??
    jobFromMeta(record(task.metadata)?._meta) ??
    jobFromMeta(task.progress)
  );
}

/** One snapshot per operation, the highest revision winning, in first-seen order. */
export function latestJobs(jobs: Iterable<JobSnapshot | null | undefined>): JobSnapshot[] {
  const latest = new Map<string, JobSnapshot>();
  for (const job of jobs) {
    if (!job) continue;
    const current = latest.get(job.operation_id);
    if (!current || job.revision >= current.revision) latest.set(job.operation_id, job);
  }
  return [...latest.values()];
}

export type JobStatusTone = 'neutral' | 'waiting' | 'active' | 'good' | 'bad';

export function jobTone(job: Pick<JobSnapshot, 'phase' | 'outcome'>): JobStatusTone {
  if (job.phase === 'ended') {
    if (job.outcome === 'succeeded') return 'good';
    if (job.outcome === 'failed' || job.outcome === 'timed_out') return 'bad';
    return 'neutral';
  }
  if (job.phase === 'running' || job.phase === 'ending') return 'active';
  if (job.phase === 'submitted' || job.phase === 'queued') return 'waiting';
  return 'neutral';
}

export function componentTone(state: string | null | undefined): JobStatusTone {
  switch (state) {
    case 'running':
    case 'starting':
      return 'active';
    case 'done':
      return 'good';
    case 'failed':
      return 'bad';
    case 'waiting':
      return 'waiting';
    default:
      return 'neutral';
  }
}

export type ComponentShape = 'nodes' | 'service' | 'install';

/**
 * How a component draws: a server the pipeline runs beside its program as a
 * stack of cards, a software install as a package on its node, and compute or
 * any role the card does not know as plain compute nodes.
 */
export function componentShape(component: JobComponent): ComponentShape {
  switch (component.role) {
    case 'service':
    case 'viewer':
      return 'service';
    case 'install':
      return 'install';
    default:
      return 'nodes';
  }
}
