import type { MemoryCreationRun } from '@clio/core/v3';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MessageSquareIcon, UploadIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { EditIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { memoryTime } from './memory-document-helpers';
import { MemoryErrorLine } from './memory-error-line';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';

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
const TONES: Record<string, StatusTone> = {
  extracting: 'running',
  curating: 'running',
  running: 'running',
  completed: 'success',
  no_candidates: 'idle',
  failed: 'error',
  error: 'error',
  cancelled: 'stopped',
  missing: 'error',
  unknown: 'warning',
  skipped: 'idle',
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
/** The background-pass roles, as Settings > Fleet names what they do. */
const ROLE_WORK: Record<string, string> = {
  memory_extract: 'noticing facts',
  memory_consolidate: 'organizing memories',
};

/** Why the background pass did not run at all, and where to fix it. */
function BackgroundBlocked({ reason, roles }: { reason?: string; roles?: string[] }) {
  if (reason !== 'lm_provider_unconfigured') return null;
  const work = (roles ?? []).map((role) => ROLE_WORK[role] ?? role.replaceAll('_', ' '));
  const named = work.length ? work.join(' and ') : 'creating memories';
  return (
    <p data-slot="memory-background-blocked">
      Background memory is off because no model is set for {named}. Choose a model for{' '}
      {work.length === 1 ? 'that role' : work.length ? 'those roles' : 'the memory roles'} in{' '}
      <Link className="text-primary underline-offset-4 hover:underline" to="/settings/fleet">
        Fleet settings
      </Link>
      , or select a{' '}
      <Link className="text-primary underline-offset-4 hover:underline" to="/settings/providers">
        model provider
      </Link>{' '}
      to use its default model.
    </p>
  );
}

function runDetails(run: MemoryCreationRun): KeyValueItem[] {
  const items: KeyValueItem[] = [
    { label: 'Extraction model', value: run.models.extract?.model_id || 'Not recorded' },
    { label: 'Curator model', value: run.models.curator?.model_id || 'Not started' },
    {
      label: 'Total model usage',
      value:
        run.usage.input_tokens !== null || run.usage.output_tokens !== null
          ? `${run.usage.input_tokens?.toLocaleString() ?? 'Unknown'} input, ${run.usage.output_tokens?.toLocaleString() ?? 'unknown'} output tokens`
          : 'Token usage unavailable',
    },
    {
      label: 'Total cost',
      value:
        run.usage.cost_known && run.usage.cost_usd !== null
          ? `$${run.usage.cost_usd.toFixed(4)}`
          : 'Cost unavailable',
    },
  ];
  if (run.extract) {
    const excluded = Object.values(run.extract.dropped).reduce((sum, n) => sum + n, 0);
    items.push({
      label: 'Candidate facts',
      value: `${run.extract.kept} kept of ${run.extract.returned}${excluded ? `, ${excluded} excluded` : ''}`,
    });
  }
  if (run.completed_at) items.push({ label: 'Finished', value: memoryTime(run.completed_at) });
  return items;
}

function Run({
  run,
  expanded,
  onToggle,
  sessionHref,
  sessionTitle,
  targetLabel,
}: {
  run: MemoryCreationRun;
  expanded: boolean;
  onToggle: () => void;
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
  const imported = run.origin.startsWith('import:');
  const title =
    (manual ? 'Manual entry' : imported ? 'Imported text' : sessionTitle(run.source_session)) ||
    'Memory creation';
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
  const summary = manual
    ? run.targets[0]?.split('/').at(-1)?.replaceAll('-', ' ') || 'Saved without a model call'
    : result || (run.extract ? `${run.extract.kept} candidate facts` : 'View run details');
  const failed = ['failed', 'error', 'missing'].includes(run.state);
  const state = run.reason === 'no_candidates' ? 'no_candidates' : run.state;
  const Icon = manual ? EditIcon : imported ? UploadIcon : MessageSquareIcon;
  const link = 'text-primary underline-offset-4 hover:underline';
  return (
    <div>
      <ItemRow
        icon={<Icon />}
        meta={
          <span className="flex min-w-0 gap-3">
            <span className="min-w-0 truncate">{summary}</span>
            <time className="shrink-0" dateTime={run.started_at}>
              {memoryTime(run.started_at)}
            </time>
          </span>
        }
        selected={expanded}
        status={
          <StatusIndicator
            label={STATES[state] ?? state.replaceAll('_', ' ')}
            tone={TONES[state] ?? 'info'}
          />
        }
        title={
          <button
            aria-expanded={expanded}
            className="max-w-full truncate text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            onClick={onToggle}
            title={title}
            type="button"
          >
            {title}
          </button>
        }
      />
      {expanded ? (
        <div className="grid min-w-0 gap-3 border-b border-border/70 py-3 pr-2 pl-10 text-[12.5px]">
          {run.reason ? (
            <p className={failed ? 'text-destructive' : 'text-muted-foreground'}>
              {REASONS[run.reason] ?? run.reason}
            </p>
          ) : null}
          {!manual ? <KeyValueGrid className="max-w-md" items={runDetails(run)} /> : null}
          <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
            {source ? (
              <Link className={link} to={source}>
                Source conversation
              </Link>
            ) : null}
            {curator ? (
              <Link className={link} to={curator}>
                Curator conversation
              </Link>
            ) : null}
            {run.targets.map((target) => (
              <Link
                className={link}
                key={target}
                to={`/settings/memory?${new URLSearchParams({ view: 'log', doc: target })}`}
              >
                {targetLabel(target)}
              </Link>
            ))}
            {counts.pending ? (
              <Link className={link} to="/settings/memory?view=review">
                Review proposed changes
              </Link>
            ) : null}
          </div>
          {run.source_session && !source ? (
            <p className="min-w-0 truncate text-muted-foreground" title={run.source_session}>
              Source conversation is not loaded:{' '}
              <span className="font-mono">{run.source_session}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Show recorded asynchronous memory attempts, including failures and empty extractions. */
export function MemoryCreationLog({
  sessionHref,
  sessionTitle,
  targetLabel,
  onSessionIds,
}: {
  sessionHref: (id: string) => string | undefined;
  sessionTitle: (id: string) => string;
  targetLabel: (name: string) => string;
  /** The sessions the shown runs name, so their titles and links can be resolved. */
  onSessionIds?: (sessionIds: readonly string[]) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [open, setOpen] = useState<string>();
  const log = useInfiniteQuery({
    queryKey: ['memory', 'creation-runs', connectionScope(settings)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => repository.memoryCreationRuns(pageParam, signal),
    getNextPageParam: (page) => page.next_cursor || undefined,
    refetchInterval: 10_000,
  });
  const runs = useMemo(() => log.data?.pages.flatMap((page) => page.runs) ?? [], [log.data]);
  useEffect(() => {
    onSessionIds?.(runs.flatMap((run) => [run.source_session, run.curator_session]));
  }, [onSessionIds, runs]);
  const background = log.data?.pages[0]?.background;
  const waiting = Object.entries(background?.skipped ?? {}).filter(([reason]) => REASONS[reason]);
  return (
    <div className="grid min-w-0">
      <SettingsGroupLabel
        actions={
          <IconButton
            disabled={log.isFetching}
            icon={<RefreshIcon />}
            label="Refresh"
            onClick={() => void log.refetch()}
            size="sm"
          />
        }
      >
        Background memory
      </SettingsGroupLabel>
      {background ? (
        <div className="grid gap-1 pb-3 text-[12.5px] text-muted-foreground">
          <p>
            {background.off
              ? 'Background memory is off.'
              : background.last_tick
                ? `Last checked ${memoryTime(background.last_tick)}`
                : 'No background check recorded yet.'}
          </p>
          <BackgroundBlocked reason={background.skipped_reason} roles={background.roles} />
          {waiting.length ? (
            <p>{waiting.map(([reason, n]) => `${REASONS[reason]} (${n})`).join(', ')}</p>
          ) : null}
        </div>
      ) : null}
      <SettingsGroupLabel>Runs</SettingsGroupLabel>
      {log.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {log.error ? (
        <MemoryErrorLine
          error={log.error}
          onRetry={() => void log.refetch()}
          what="Memory creation runs could not be loaded."
        />
      ) : null}
      {!log.isPending && !log.error && !runs.length ? (
        <StateView kind="empty" size="row" title="No memory creation runs recorded yet" />
      ) : null}
      {runs.length ? (
        <ItemList label="Memory creation runs">
          {runs.map((run) => (
            <Run
              expanded={open === run.id}
              key={run.id}
              onToggle={() => setOpen((current) => (current === run.id ? undefined : run.id))}
              run={run}
              sessionHref={sessionHref}
              sessionTitle={sessionTitle}
              targetLabel={targetLabel}
            />
          ))}
        </ItemList>
      ) : null}
      {log.hasNextPage ? (
        <div className="pt-3">
          <Button
            disabled={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
            size="sm"
            variant="outline"
          >
            Load earlier runs
          </Button>
        </div>
      ) : null}
    </div>
  );
}
