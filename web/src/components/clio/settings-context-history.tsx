import { queryKeys } from '@/lib/query-keys';
import type { MemoryEvent, Session, SessionMemoryStatistics } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, BrainCircuitIcon, DatabaseIcon, FileArchiveIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/clio/settings-frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { isPrimarySession } from '@/lib/recent-sessions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

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

function retentionStatus(statistics: SessionMemoryStatistics) {
  if (statistics.threshold_state === 'critical') return 'degraded' as const;
  if (statistics.threshold_state === 'warning') return 'degraded' as const;
  if (statistics.threshold_state === 'empty') return 'unavailable' as const;
  return 'healthy' as const;
}

function retentionLabel(statistics: SessionMemoryStatistics) {
  if (statistics.threshold_state === 'critical') return 'Context limit reached';
  if (statistics.threshold_state === 'warning') return 'Approaching context limit';
  if (statistics.threshold_state === 'empty') return 'No retained context';
  return 'Within context budget';
}

function compactionStatusLabel(status: string) {
  if (status === 'stored') return 'Retained';
  if (status === 'archived') return 'Archived';
  if (status === 'completed' || status === 'complete') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Status unavailable';
}

function compactionSourceLabel(source: unknown) {
  if (source === 'gact_compact') return 'Service compaction';
  if (typeof source === 'string' && source.trim()) return 'Service record';
  return 'Service compaction';
}

function MemoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <Frame spacing="sm">
      <FramePanel>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </FramePanel>
    </Frame>
  );
}

function RetentionSummary({ statistics }: { statistics: SessionMemoryStatistics }) {
  const pressure = Math.min(100, Math.max(0, statistics.token_pressure * 100));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Retained session context</p>
          <p className="text-xs text-muted-foreground">
            {number(statistics.messages_retained)} messages,{' '}
            {number(statistics.context_files_attached)} attached files
          </p>
        </div>
        <ClioStatus
          detail={
            statistics.compaction_recommended
              ? 'The service recommends compacting this session.'
              : 'The service does not recommend compaction now.'
          }
          label={retentionLabel(statistics)}
          value={retentionStatus(statistics)}
        />
      </div>
      {statistics.tokens_budget ? (
        <div>
          <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{number(statistics.tokens_retained)} retained tokens</span>
            <span>{number(statistics.tokens_budget)} token budget</span>
          </div>
          <Progress aria-label="Retained token pressure" value={pressure} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {number(statistics.tokens_retained)} retained tokens, budget unavailable
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {number(statistics.compact_summaries)} compact summaries retained. Compaction is performed
        only by the service and remains visible in the history below.
      </p>
    </div>
  );
}

function MemoryHistory({ events, session }: { events: MemoryEvent[]; session?: Session }) {
  if (!events.length) {
    return (
      <Empty className="min-h-44 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileArchiveIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No compaction history</EmptyTitle>
          <EmptyDescription>
            The service has not recorded a transcript compaction for this session.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="grid gap-1">
      {[...events].reverse().map((event) => (
        <ClioInteractiveRow
          actions={
            session ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  aria-label="Open retained summary in conversation"
                  to={`/workspaces/${session.workspace_id}/sessions/${session.id}#message-${event.summary_message_id}`}
                >
                  Summary <ArrowUpRightIcon aria-hidden="true" />
                </Link>
              </Button>
            ) : null
          }
          className="items-start py-3"
          key={event.id}
        >
          <div className="grid gap-1.5 pr-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Compacted transcript</p>
              <Badge title={`Recorded status: ${event.arc_status}`} variant="outline">
                {compactionStatusLabel(event.arc_status)}
              </Badge>
              <span className="text-xs text-muted-foreground">{time(event.created_at)}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Archived {number(event.archived_count)} messages into a {number(event.summary_chars)}
              -character summary.
            </p>
            {event.focus ? <p className="line-clamp-3 text-sm">{event.focus}</p> : null}
            <p
              className="text-xs text-muted-foreground"
              title={
                event.metadata.source
                  ? `Recorded source: ${String(event.metadata.source)}`
                  : undefined
              }
            >
              Source {compactionSourceLabel(event.metadata.source)}, version {event.version}
            </p>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

/** Context usage and compaction for one conversation (moved here from the Memory page). */
export function ContextHistorySettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const sessions = useQuery({
    queryKey: queryKeys.key('all-sessions', settings.endpoint, 'context-history'),
    queryFn: ({ signal }) => repository.allSessions(signal),
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
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="Context usage and compaction for one conversation, as the service reports them."
        title="Context & compaction"
      />
      {statistics.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MemoryMetric
            label="Stored conversations"
            value={number(statistics.data.global.conversations_total)}
          />
          <MemoryMetric
            label="Stored tool invocations"
            value={number(statistics.data.global.invocations_total)}
          />
          <MemoryMetric label="Cache hits" value={number(statistics.data.cache.hits)} />
          <MemoryMetric label="Cache misses" value={number(statistics.data.cache.misses)} />
        </div>
      ) : null}
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <BrainCircuitIcon aria-hidden="true" className="size-4 text-primary" /> Session
            retention
          </FrameTitle>
          <FrameDescription>
            Retention and compaction values are reported by the service for the selected session.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-5">
          <div className="grid max-w-md gap-2">
            <Label htmlFor="context-session">Session</Label>
            <Select onValueChange={setSessionId} value={selectedSessionId}>
              <SelectTrigger className="w-full" id="context-session">
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
          </div>
          {statistics.data?.session ? (
            <RetentionSummary statistics={statistics.data.session} />
          ) : statistics.isPending ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <Alert>
              <DatabaseIcon aria-hidden="true" />
              <AlertTitle>Session retention unavailable</AlertTitle>
              <AlertDescription>
                Choose a session with retained context to inspect its pressure and history.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Compaction history</p>
            {events.data ? <MemoryHistory events={events.data} session={selectedSession} /> : null}
            {events.isPending && selectedSessionId ? <Skeleton className="h-44 w-full" /> : null}
            {events.error ? (
              <Alert variant="destructive">
                <FileArchiveIcon aria-hidden="true" />
                <AlertTitle>Compaction history unavailable</AlertTitle>
                <AlertDescription>{events.error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
