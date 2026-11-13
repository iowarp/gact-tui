import { workspaceName } from '@/lib/workspace-labels';
import { queryKeys } from '@/lib/query-keys';
import type { MemoryEvent, Session, SessionMemoryStatistics } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, FileArchiveIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useRepository } from '@/hooks/use-repository';
import { isPrimarySession } from '@/lib/recent-sessions';
import { recentSessionsWith } from '@/lib/session-pages';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsLoadError } from './settings-health-load-error';
import { notOffered } from './settings-health-reason';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { ScheduleSelect, type ScheduleSelectOption } from './settings-schedule-fields';
import { plural, t, ph } from '@lingui/core/macro';
import { formatDateTime, formatNumber } from '@/lib/locale-format';
import { Trans } from '@lingui/react/macro';

function number(value: number) {
  return formatNumber(value);
}

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t`Time unavailable` : formatDateTime(date);
}

function sessionLabel(session: Session) {
  return session.title.trim() || t`Untitled session`;
}

function retentionTone(statistics: SessionMemoryStatistics): StatusTone {
  if (statistics.threshold_state === 'critical') return 'error';
  if (statistics.threshold_state === 'warning') return 'warning';
  if (statistics.threshold_state === 'empty') return 'idle';
  return 'success';
}

function retentionLabel(statistics: SessionMemoryStatistics) {
  if (statistics.threshold_state === 'critical') return t`Context limit reached`;
  if (statistics.threshold_state === 'warning') return t`Approaching context limit`;
  if (statistics.threshold_state === 'empty') return t`No retained context`;
  return t`Within context budget`;
}

function compactionStatus(status: string): { tone: StatusTone; label: string } {
  if (status === 'stored') return { tone: 'success', label: t`Retained` };
  if (status === 'archived') return { tone: 'idle', label: t`Archived` };
  if (status === 'completed' || status === 'complete')
    return { tone: 'success', label: t`Completed` };
  if (status === 'failed') return { tone: 'error', label: t`Failed` };
  return { tone: 'idle', label: t`Status unavailable` };
}

function compactionSourceLabel(source: unknown) {
  if (source === 'gact_compact') return t`Service compaction`;
  if (typeof source === 'string' && source.trim()) return t`Service record`;
  return t`Service compaction`;
}

function ValueRow({ title, value, info }: { title: string; value: string; info?: string }) {
  return (
    <SettingsRow info={info} inlineControl title={title}>
      <span className="text-ui text-foreground tabular-nums">{value}</span>
    </SettingsRow>
  );
}

function RetentionSummary({ statistics }: { statistics: SessionMemoryStatistics }) {
  const pressure = Math.min(100, Math.max(0, statistics.token_pressure * 100));
  return (
    <>
      <SettingsRow
        info={
          statistics.compaction_recommended
            ? t`The service recommends compacting this session.`
            : t`The service does not recommend compaction now.`
        }
        inlineControl
        note={t`${plural(statistics.messages_retained, { one: '# message', other: '# messages' })}, ${plural(
          statistics.context_files_attached,
          { one: '# attached file', other: '# attached files' },
        )}`}
        title={t`Retained session context`}
      >
        <StatusIndicator label={retentionLabel(statistics)} tone={retentionTone(statistics)} />
      </SettingsRow>
      <SettingsRow
        inlineControl
        note={
          statistics.tokens_budget
            ? t`${ph({ retained: number(statistics.tokens_retained) })} of ${ph({ budget: number(statistics.tokens_budget) })} tokens`
            : t`${ph({ retained: number(statistics.tokens_retained) })} tokens, budget unavailable`
        }
        title={t`Retained tokens`}
      >
        {statistics.tokens_budget ? (
          <Progress aria-label={t`Retained token pressure`} className="w-32" value={pressure} />
        ) : null}
      </SettingsRow>
      <ValueRow
        info={t`Compaction is performed only by the service and remains visible in the history below.`}
        title={t`Compact summaries`}
        value={number(statistics.compact_summaries)}
      />
    </>
  );
}

function CompactionRow({ event, session }: { event: MemoryEvent; session?: Session }) {
  const status = compactionStatus(event.arc_status);
  const archived = t`Archived ${plural(event.archived_count, { one: '# message', other: '# messages' })} into a ${ph({ characters: number(event.summary_chars) })}-character summary`;
  const source = t`Source ${ph({ source: compactionSourceLabel(event.metadata.source) })}, version ${ph({ version: event.version })}`;
  return (
    <ItemRow
      icon={<FileArchiveIcon />}
      meta={
        <span
          title={[
            event.focus,
            archived,
            source,
            t`Recorded status: ${ph({ arc_status: event.arc_status })}`,
          ]
            .filter(Boolean)
            .join('\n')}
        >
          {event.focus ? <span className="mr-2.5">{event.focus}</span> : null}
          <span className="mr-2.5">{archived}</span>
          <span>{source}</span>
        </span>
      }
      slot={
        session ? (
          <Button asChild size="sm" variant="outline">
            <Link
              aria-label={t`Open retained summary in conversation`}
              to={`/workspaces/${session.workspace_id}/sessions/${session.id}#message-${event.summary_message_id}`}
            >
              {t`Summary`} <ArrowUpRightIcon aria-hidden="true" />
            </Link>
          </Button>
        ) : undefined
      }
      slotWidth={96}
      status={<StatusIndicator label={status.label} tone={status.tone} />}
      statusWidth={120}
      title={
        <>
          <Trans>
            Compacted transcript
            <span className="ml-2.5 font-normal text-muted-foreground">
              {time(event.created_at)}
            </span>
          </Trans>
        </>
      }
    />
  );
}

/** Context usage and compaction for one conversation (moved here from the Memory page). */
export function ContextHistorySettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const sessions = useQuery({
    queryKey: queryKeys.key(
      'session-pages',
      settings.endpoint,
      'context-history',
      initialSessionId ?? '',
    ),
    queryFn: ({ signal }) => recentSessionsWith(repository, { ids: [initialSessionId] }, signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const workspaceNameById = new Map(
    (workspaces.data ?? []).map((item) => [item.id, workspaceName(item)]),
  );
  const primarySessions = (sessions.data ?? []).filter(isPrimarySession);
  const sessionOptions: ScheduleSelectOption[] = primarySessions.map((session) => ({
    value: session.id,
    label: sessionLabel(session),
    hint: workspaceNameById.get(session.workspace_id),
  }));
  const selectedSessionId = primarySessions.some((session) => session.id === sessionId)
    ? sessionId
    : (primarySessions[0]?.id ?? '');
  const selectedSession = primarySessions.find((session) => session.id === selectedSessionId);
  const statistics = useQuery({
    queryKey: queryKeys.key('memory-statistics', settings.endpoint, selectedSessionId),
    queryFn: ({ signal }) => repository.memoryStatistics(signal, selectedSessionId || undefined),
  });
  const events = useQuery({
    queryKey: queryKeys.key('memory-events', settings.endpoint, selectedSessionId),
    queryFn: ({ signal }) => repository.memoryEvents(selectedSessionId, undefined, signal),
    enabled: Boolean(selectedSessionId),
  });

  // A part the agent lacks drops its label and control; the page names it on one line.
  const retentionOffered = !notOffered(statistics.error);
  const compactionOffered = !notOffered(events.error);

  return (
    <section aria-label={t`Context & compaction`}>
      {retentionOffered ? (
        <>
          <SettingsGroupLabel
            info={t`Context usage, retention and compaction for one conversation, as the service reports them.`}
          >
            {t`Session retention`}
          </SettingsGroupLabel>
          {sessionOptions.length ? (
            <SettingsRow htmlFor="context-session" title={t`Conversation`}>
              <ScheduleSelect
                className="w-[clamp(10rem,100%,16rem)]"
                id="context-session"
                label={t`Session`}
                onChange={setSessionId}
                options={sessionOptions}
                placeholder={t`Choose a session`}
                value={selectedSessionId}
              />
            </SettingsRow>
          ) : null}
        </>
      ) : null}
      {statistics.data?.session ? (
        <RetentionSummary statistics={statistics.data.session} />
      ) : statistics.isPending ? (
        <StateView kind="loading" size="row" title={t`Loading session retention…`} />
      ) : statistics.isError ? (
        <SettingsLoadError
          error={statistics.error}
          onRetry={() => void statistics.refetch()}
          retrying={statistics.isFetching}
          noun="session retention"
          title={t`Session retention unavailable.`}
        />
      ) : (
        <StateView
          detail={t`Choose a session with retained context.`}
          kind="empty"
          size="row"
          title={t`Session retention unavailable`}
        />
      )}
      {compactionOffered ? <SettingsGroupLabel>{t`Compaction history`}</SettingsGroupLabel> : null}
      {events.data?.length ? (
        <ItemList label={t`Compaction history`}>
          {[...events.data].reverse().map((event) => (
            <CompactionRow event={event} key={event.id} session={selectedSession} />
          ))}
        </ItemList>
      ) : null}
      {events.data && !events.data.length && !events.error ? (
        <StateView kind="empty" size="row" title={t`No compactions in this conversation yet`} />
      ) : null}
      {!selectedSessionId && !sessions.isPending && (retentionOffered || compactionOffered) ? (
        <StateView kind="empty" size="row" title={t`No conversations yet`} />
      ) : null}
      {compactionOffered && (sessions.isPending || (events.isPending && selectedSessionId)) ? (
        <StateView kind="loading" size="row" title={t`Loading compaction history…`} />
      ) : null}
      {events.error ? (
        <SettingsLoadError
          error={events.error}
          onRetry={() => void events.refetch()}
          retrying={events.isFetching}
          noun="compaction history"
          title={t`Compaction history unavailable.`}
        />
      ) : null}
      {statistics.data ? (
        <>
          <SettingsGroupLabel>{t`All conversations`}</SettingsGroupLabel>
          <ValueRow
            title={t`Stored conversations`}
            value={number(statistics.data.global.conversations_total)}
          />
          <ValueRow
            title={t`Stored tool invocations`}
            value={number(statistics.data.global.invocations_total)}
          />
          <ValueRow title={t`Cache hits`} value={number(statistics.data.cache.hits)} />
          <ValueRow title={t`Cache misses`} value={number(statistics.data.cache.misses)} />
        </>
      ) : null}
    </section>
  );
}
