import type { MemoryEvent, MemorySearchHit, Session, SessionMemoryStatistics } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRightIcon,
  BrainCircuitIcon,
  DatabaseIcon,
  FileArchiveIcon,
  MessageSquareTextIcon,
  SearchIcon,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageResponse } from '@/components/ai-elements/message';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
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

function SearchResult({ hit }: { hit: MemorySearchHit }) {
  return (
    <ClioInteractiveRow
      actions={
        <Button asChild size="sm" variant="outline">
          <Link
            aria-label={`Open ${hit.session_title || 'session'} at matching message`}
            to={`/workspaces/${hit.workspace_id}/sessions/${hit.session_id}#message-${hit.message_id}`}
          >
            Open <ArrowUpRightIcon aria-hidden="true" />
          </Link>
        </Button>
      }
      className="items-start py-3"
    >
      <div className="grid gap-2 pr-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{hit.session_title || 'Untitled session'}</p>
          <Badge variant="outline">{hit.role}</Badge>
          <span className="text-xs text-muted-foreground">{time(hit.created_at)}</span>
        </div>
        <MessageResponse className="line-clamp-4 text-sm text-muted-foreground">
          {hit.text}
        </MessageResponse>
        {hit.match_terms.length ? (
          <p className="text-xs text-muted-foreground">
            Matched {hit.match_terms.join(', ')}, relevance {Math.round(hit.score * 100)}%
          </p>
        ) : null}
      </div>
    </ClioInteractiveRow>
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

export function MemorySettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [crossSession, setCrossSession] = useState(false);
  const sessions = useQuery({
    queryKey: ['all-sessions', settings.endpoint, 'memory-settings'],
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const primarySessions = (sessions.data ?? []).filter(isPrimarySession);
  const selectedSessionId = primarySessions.some((session) => session.id === sessionId)
    ? sessionId
    : (primarySessions[0]?.id ?? '');
  const selectedSession = primarySessions.find((session) => session.id === selectedSessionId);
  const statistics = useQuery({
    queryKey: ['memory-statistics', settings.endpoint, selectedSessionId],
    queryFn: ({ signal }) => repository.memoryStatistics(signal, selectedSessionId || undefined),
  });
  const events = useQuery({
    queryKey: ['memory-events', settings.endpoint, selectedSessionId],
    queryFn: ({ signal }) => repository.memoryEvents(selectedSessionId, 50, signal),
    enabled: Boolean(selectedSessionId),
  });
  const search = useQuery({
    queryKey: ['memory-search', settings.endpoint, selectedSessionId, submittedQuery, crossSession],
    queryFn: ({ signal }) =>
      repository.searchMemory(
        submittedQuery,
        {
          sessionId: selectedSessionId || undefined,
          includeCrossSession: crossSession,
          limit: 50,
        },
        signal,
      ),
    enabled: Boolean(selectedSessionId && submittedQuery),
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (nextQuery) setSubmittedQuery(nextQuery);
  }

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="Search retained conversations, inspect session pressure, and audit compaction without reading service logs. Cross-session recall is always an explicit choice."
        title="Memory"
      />

      {statistics.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MemoryMetric
            label="Remembered conversations"
            value={number(statistics.data.global.conversations_total)}
          />
          <MemoryMetric
            label="Remembered tool invocations"
            value={number(statistics.data.global.invocations_total)}
          />
          <MemoryMetric label="Cache hits" value={number(statistics.data.cache.hits)} />
          <MemoryMetric label="Cache misses" value={number(statistics.data.cache.misses)} />
        </div>
      ) : null}

      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <SearchIcon aria-hidden="true" className="size-4 text-primary" /> Search retained
            conversations
          </FrameTitle>
          <FrameDescription>
            Search starts inside the selected session. Enable workspace recall only when you intend
            to use related sessions.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
            <div className="grid gap-2">
              <Label htmlFor="memory-session">Session</Label>
              <Select onValueChange={setSessionId} value={selectedSessionId}>
                <SelectTrigger className="w-full" id="memory-session">
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
            <form className="grid gap-2" onSubmit={submitSearch}>
              <Label htmlFor="memory-query">Find remembered evidence or decisions</Label>
              <div className="flex gap-2">
                <Input
                  id="memory-query"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this session"
                  value={query}
                />
                <Button disabled={!selectedSessionId || !query.trim()} type="submit">
                  <SearchIcon aria-hidden="true" /> Search
                </Button>
              </div>
            </form>
          </div>
          <Label className="w-fit rounded-lg border px-3 py-2.5">
            <Checkbox
              checked={crossSession}
              onCheckedChange={(checked) => setCrossSession(checked === true)}
            />
            <span className="grid gap-1">
              <span>Include related sessions in this workspace</span>
              <span className="font-normal text-muted-foreground">
                This expands recall only after you submit a search.
              </span>
            </span>
          </Label>

          {search.data ? (
            <div aria-live="polite" className="grid gap-2">
              <p className="text-sm font-medium">
                {number(search.data.hits.length)} results across{' '}
                {number(search.data.searched_sessions.length)} sessions
              </p>
              {search.data.hits.map((hit) => (
                <SearchResult
                  hit={hit}
                  key={`${hit.session_id}:${hit.message_id}:${hit.part_id}`}
                />
              ))}
              {!search.data.hits.length ? (
                <Empty className="min-h-44 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageSquareTextIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No retained matches</EmptyTitle>
                    <EmptyDescription>
                      The service found no transcript content matching “{search.data.query}”.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </div>
          ) : null}
          {search.isFetching ? <Skeleton className="h-24 w-full" /> : null}
          {search.error ? (
            <Alert variant="destructive">
              <SearchIcon aria-hidden="true" />
              <AlertTitle>Memory search unavailable</AlertTitle>
              <AlertDescription>{search.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>

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
