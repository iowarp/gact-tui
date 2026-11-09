import { queryKeys } from '@/lib/query-keys';
import type { MemoryEvent, Session, SessionMemoryStatistics } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, FileArchiveIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { isPrimarySession } from '@/lib/recent-sessions';
import { recentSessionsWith } from '@/lib/session-pages';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsLoadError } from './settings-health-load-error';
import { SettingsGroupLabel, SettingsRow } from './settings-row';

function number(value: number) {
  return value.toLocaleString();
}

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

function sessionLabel(session: Session) {
  return session.title.trim() || 'Untitled session';
}

function retentionTone(statistics: SessionMemoryStatistics): StatusTone {
  if (statistics.threshold_state === 'critical') return 'error';
  if (statistics.threshold_state === 'warning') return 'warning';
  if (statistics.threshold_state === 'empty') return 'idle';
  return 'success';
}

function retentionLabel(statistics: SessionMemoryStatistics) {
  if (statistics.threshold_state === 'critical') return 'Context limit reached';
  if (statistics.threshold_state === 'warning') return 'Approaching context limit';
  if (statistics.threshold_state === 'empty') return 'No retained context';
  return 'Within context budget';
}

function compactionStatus(status: string): { tone: StatusTone; label: string } {
  if (status === 'stored') return { tone: 'success', label: 'Retained' };
  if (status === 'archived') return { tone: 'idle', label: 'Archived' };
  if (status === 'completed' || status === 'complete')
    return { tone: 'success', label: 'Completed' };
  if (status === 'failed') return { tone: 'error', label: 'Failed' };
  return { tone: 'idle', label: 'Status unavailable' };
}

function compactionSourceLabel(source: unknown) {
  if (source === 'gact_compact') return 'Service compaction';
  if (typeof source === 'string' && source.trim()) return 'Service record';
  return 'Service compaction';
}

function ValueRow({ title, value, info }: { title: string; value: string; info?: string }) {
  return (
    <SettingsRow info={info} inlineControl title={title}>
      <span className="text-[0.8125rem] text-foreground tabular-nums">{value}</span>
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
            ? 'The service recommends compacting this session.'
            : 'The service does not recommend compaction now.'
        }
        inlineControl
        note={`${number(statistics.messages_retained)} messages, ${number(statistics.context_files_attached)} attached files`}
        title="Retained session context"
      >
        <StatusIndicator label={retentionLabel(statistics)} tone={retentionTone(statistics)} />
      </SettingsRow>
      <SettingsRow
        inlineControl
        note={
          statistics.tokens_budget
            ? `${number(statistics.tokens_retained)} of ${number(statistics.tokens_budget)} tokens`
            : `${number(statistics.tokens_retained)} tokens, budget unavailable`
        }
        title="Retained tokens"
      >
        {statistics.tokens_budget ? (
          <Progress aria-label="Retained token pressure" className="w-32" value={pressure} />
        ) : null}
      </SettingsRow>
      <ValueRow
        info="Compaction is performed only by the service and remains visible in the history below."
        title="Compact summaries"
        value={number(statistics.compact_summaries)}
      />
    </>
  );
}

function CompactionRow({ event, session }: { event: MemoryEvent; session?: Session }) {
  const status = compactionStatus(event.arc_status);
  const archived = `Archived ${number(event.archived_count)} messages into a ${number(event.summary_chars)}-character summary`;
  const source = `Source ${compactionSourceLabel(event.metadata.source)}, version ${event.version}`;
  return (
    <ItemRow
      icon={<FileArchiveIcon />}
      meta={
        <span
          title={[event.focus, archived, source, `Recorded status: ${event.arc_status}`]
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
              aria-label="Open retained summary in conversation"
              to={`/workspaces/${session.workspace_id}/sessions/${session.id}#message-${event.summary_message_id}`}
            >
              Summary <ArrowUpRightIcon aria-hidden="true" />
            </Link>
          </Button>
        ) : undefined
      }
      slotWidth={96}
      status={<StatusIndicator label={status.label} tone={status.tone} />}
      statusWidth={120}
      title={
        <>
          Compacted transcript
          <span className="ml-2.5 font-normal text-faint">{time(event.created_at)}</span>
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
  const primarySessions = (sessions.data ?? []).filter(isPrimarySession);
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

  return (
    <section aria-label="Context & compaction">
      <SettingsGroupLabel
        actions={
          <Select onValueChange={setSessionId} value={selectedSessionId}>
            <SelectTrigger
              aria-label="Session"
              className="h-7 w-[clamp(10rem,45%,16rem)] min-w-0 text-[0.78125rem] text-foreground"
              id="context-session"
              size="sm"
            >
              <SelectValue placeholder="Choose a session" />
            </SelectTrigger>
            <SelectContent>
              {primarySessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {sessionLabel(session)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        className="w-full @3xl:w-[60%]"
        info="Context usage, retention and compaction for one conversation, as the service reports them."
      >
        Session retention
      </SettingsGroupLabel>
      {statistics.data?.session ? (
        <RetentionSummary statistics={statistics.data.session} />
      ) : statistics.isPending ? (
        <StateView kind="loading" size="row" title="Loading session retention…" />
      ) : statistics.isError ? (
        <SettingsLoadError
          error={statistics.error}
          onRetry={() => void statistics.refetch()}
          retrying={statistics.isFetching}
          title="Session retention unavailable."
        />
      ) : (
        <StateView
          detail="Choose a session with retained context."
          kind="empty"
          size="row"
          title="Session retention unavailable"
        />
      )}
      <SettingsGroupLabel>Compaction history</SettingsGroupLabel>
      {events.data?.length ? (
        <ItemList label="Compaction history">
          {[...events.data].reverse().map((event) => (
            <CompactionRow event={event} key={event.id} session={selectedSession} />
          ))}
        </ItemList>
      ) : null}
      {events.data && !events.data.length && !events.error ? (
        <StateView
          detail="The service has not recorded a transcript compaction for this session."
          kind="empty"
          size="row"
          title="No compaction history"
        />
      ) : null}
      {!selectedSessionId && !sessions.isPending ? (
        <StateView kind="empty" size="row" title="No conversations yet" />
      ) : null}
      {events.isPending && selectedSessionId ? (
        <StateView kind="loading" size="row" title="Loading compaction history…" />
      ) : null}
      {events.error ? (
        <SettingsLoadError
          error={events.error}
          onRetry={() => void events.refetch()}
          retrying={events.isFetching}
          title="Compaction history unavailable."
        />
      ) : null}
      {statistics.data ? (
        <>
          <SettingsGroupLabel>All conversations</SettingsGroupLabel>
          <ValueRow
            title="Stored conversations"
            value={number(statistics.data.global.conversations_total)}
          />
          <ValueRow
            title="Stored tool invocations"
            value={number(statistics.data.global.invocations_total)}
          />
          <ValueRow title="Cache hits" value={number(statistics.data.cache.hits)} />
          <ValueRow title="Cache misses" value={number(statistics.data.cache.misses)} />
        </>
      ) : null}
    </section>
  );
}
