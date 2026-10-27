import type { MemoryCreationRun } from '@clio/core/v3';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

const STATES: Record<string, string> = {
  extracting: 'Reading conversation',
  curating: 'Creating memories',
  running: 'Creating memories',
  completed: 'Completed',
  no_candidates: 'Nothing to remember',
  failed: 'Failed',
  error: 'Failed',
  cancelled: 'Cancelled',
  missing: 'Run unavailable',
  unknown: 'Outcome unknown',
  skipped: 'Skipped',
};
const REASONS: Record<string, string> = {
  too_few_new_messages: 'Waiting for more conversation messages',
  not_idle_yet: 'Waiting for the configured delay',
  session_busy: 'Conversation still running',
  pass_in_flight: 'Memory creation already running',
  last_pass_failed: 'Previous attempt failed; waiting for new messages',
  memory_disabled: 'Memory is off',
  session_memory_off: 'Memory is off for this conversation',
  no_candidates: 'No new durable facts found',
  source_changed: 'Conversation changed while being read; another pass can read the new messages',
  conversation_changed_during_extract:
    'The conversation changed while it was being read. A later pass can read the new messages.',
  created_by_user: 'Saved directly by you. No model call was used.',
  already_present: 'These facts were already saved; no duplicate was added.',
  memory_conflict:
    'A memory with this subject already exists. Open it to inspect or update its facts.',
  curator_tool_errors_no_proposals:
    'The curator finished, but its memory tools failed and no changes were saved or proposed.',
  curator_task_unavailable: 'The recorded curator task cannot be loaded. Its outcome is unknown.',
};
const time = (stamp: string) =>
  stamp && !Number.isNaN(Date.parse(stamp))
    ? new Date(stamp).toLocaleString()
    : 'Time not recorded';

function Run({
  run,
  sessionHref,
  sessionTitle,
  targetLabel,
}: {
  run: MemoryCreationRun;
  sessionHref: (id: string) => string | undefined;
  sessionTitle: (id: string) => string;
  targetLabel: (name: string) => string;
}) {
  const runHref = (id: string) =>
    sessionHref(id) ||
    (id && run.workspace_id
      ? `/workspaces/${encodeURIComponent(run.workspace_id)}/sessions/${encodeURIComponent(id)}`
      : undefined);
  const source = runHref(run.source_session);
  const curator = runHref(run.curator_session);
  const manual = run.origin === 'manual';
  const title = manual
    ? 'Manual entry'
    : run.origin.startsWith('import:')
      ? 'Imported text'
      : sessionTitle(run.source_session);
  const counts = run.proposal_counts;
  const result = [
    counts.accepted
      ? `${counts.accepted} ${counts.accepted === 1 ? 'change' : 'changes'} saved`
      : '',
    counts.pending ? `${counts.pending} awaiting review` : '',
    counts.rejected ? `${counts.rejected} rejected` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const failed = ['failed', 'error', 'missing'].includes(run.state);
  return (
    <li className="border-b last:border-b-0">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 py-3 sm:flex sm:flex-wrap sm:gap-x-4 [&::-webkit-details-marker]:hidden">
          <span className="col-span-3 min-w-0 sm:flex-1">
            <span className="block truncate font-medium">{title || 'Memory creation'}</span>
            <span className="text-sm text-muted-foreground">
              {manual
                ? run.targets[0]?.split('/').at(-1)?.replaceAll('-', ' ') ||
                  'Saved without a model call'
                : result ||
                  (run.extract ? `${run.extract.kept} candidate facts` : 'View run details')}
            </span>
          </span>
          <span className={failed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {run.reason === 'no_candidates'
              ? 'Nothing to remember'
              : (STATES[run.state] ?? run.state.replaceAll('_', ' '))}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={run.started_at}>
            {time(run.started_at)}
          </time>
          <span aria-hidden="true" className="text-muted-foreground group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="grid gap-3 pb-4 text-sm">
          {run.reason ? (
            <p className={failed ? 'text-destructive' : 'text-muted-foreground'}>
              {REASONS[run.reason] ?? run.reason}
            </p>
          ) : null}
          {!manual ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 [&_dd]:min-w-0 [&_dd]:break-words">
              <dt className="text-muted-foreground">Extraction model</dt>
              <dd>{run.models.extract?.model_id || 'Not recorded'}</dd>
              <dt className="text-muted-foreground">Curator model</dt>
              <dd>{run.models.curator?.model_id || 'Not started'}</dd>
              <dt className="text-muted-foreground">Total model usage</dt>
              <dd>
                {run.usage.input_tokens !== null || run.usage.output_tokens !== null
                  ? `${run.usage.input_tokens?.toLocaleString() ?? '—'} input, ${run.usage.output_tokens?.toLocaleString() ?? '—'} output tokens`
                  : 'Token usage unavailable'}
              </dd>
              <dt className="text-muted-foreground">Total cost</dt>
              <dd>
                {run.usage.cost_known && run.usage.cost_usd !== null
                  ? `$${run.usage.cost_usd.toFixed(4)}`
                  : 'Cost unavailable'}
              </dd>
              {run.extract ? (
                <>
                  <dt className="text-muted-foreground">Candidate facts</dt>
                  <dd>
                    {run.extract.kept} kept of {run.extract.returned}
                    {Object.values(run.extract.dropped).some(Boolean)
                      ? `, ${Object.values(run.extract.dropped).reduce((sum, n) => sum + n, 0)} excluded`
                      : ''}
                  </dd>
                </>
              ) : null}
              {run.completed_at ? (
                <>
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd>{time(run.completed_at)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <div className="flex flex-wrap gap-4">
            {source ? (
              <Link className="text-primary hover:underline" to={source}>
                Source conversation
              </Link>
            ) : null}
            {curator ? (
              <Link className="text-primary hover:underline" to={curator}>
                Curator conversation
              </Link>
            ) : null}
            {run.targets.map((target) => (
              <Link
                key={target}
                className="text-primary hover:underline"
                to={`/settings/memory?${new URLSearchParams({ view: 'log', doc: target })}`}
              >
                {targetLabel(target)}
              </Link>
            ))}
            {counts.pending ? (
              <Link className="text-primary hover:underline" to="/settings/memory?view=review">
                Review proposed changes
              </Link>
            ) : null}
          </div>
          {run.source_session && !source ? (
            <p className="text-sm text-muted-foreground">
              Source conversation is not loaded:{' '}
              <span className="break-all font-mono">{run.source_session}</span>
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Show recorded asynchronous memory attempts, including failures and empty extractions. */
export function MemoryCreationLog({
  sessionHref,
  sessionTitle,
  targetLabel,
}: {
  sessionHref: (id: string) => string | undefined;
  sessionTitle: (id: string) => string;
  targetLabel: (name: string) => string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const log = useInfiniteQuery({
    queryKey: ['memory', 'creation-runs', connectionScope(settings)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => repository.memoryCreationRuns(pageParam, signal),
    getNextPageParam: (page) => page.next_cursor || undefined,
    refetchInterval: 10_000,
  });
  const runs = log.data?.pages.flatMap((page) => page.runs) ?? [];
  const background = log.data?.pages[0]?.background;
  const waiting = Object.entries(background?.skipped ?? {}).filter(([reason]) => REASONS[reason]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Memory creation attempts, including background model runs and memories you save directly.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void log.refetch()}
          disabled={log.isFetching}
        >
          Refresh
        </Button>
      </div>
      {background ? (
        <div className="text-sm text-muted-foreground">
          <p>
            {background.off
              ? 'Background memory is off.'
              : background.last_tick
                ? `Last checked ${time(background.last_tick)}`
                : 'No background check recorded yet.'}
          </p>
          {waiting.length ? (
            <p>{waiting.map(([reason, n]) => `${REASONS[reason]} (${n})`).join(', ')}</p>
          ) : null}
        </div>
      ) : null}
      {log.isPending ? <p role="status">Loading creation log…</p> : null}
      {log.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load memory creation runs: {log.error.message}
        </p>
      ) : null}
      {!log.isPending && !log.error && !runs.length ? (
        <p className="py-4 text-sm text-muted-foreground">
          No memory creation runs recorded yet. Runs appear here even when they find nothing to
          remember.
        </p>
      ) : null}
      {runs.length ? (
        <ul aria-label="Memory creation runs">
          {runs.map((run) => (
            <Run
              key={run.id}
              run={run}
              sessionHref={sessionHref}
              sessionTitle={sessionTitle}
              targetLabel={targetLabel}
            />
          ))}
        </ul>
      ) : null}
      {log.hasNextPage ? (
        <div>
          <Button
            onClick={() => void log.fetchNextPage()}
            disabled={log.isFetchingNextPage}
            variant="outline"
          >
            Load earlier runs
          </Button>
        </div>
      ) : null}
    </div>
  );
}
