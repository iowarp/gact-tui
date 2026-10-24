import { queryKeys } from '@/lib/query-keys';
import type { MemorySearchHit, Session } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, MessageSquareTextIcon, SearchIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageResponse } from '@/components/ai-elements/message';
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

/** Search the retained transcripts of past conversations. */
export function PastSessionsSearch({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [crossSession, setCrossSession] = useState(false);
  const sessions = useQuery({
    queryKey: queryKeys.key('all-sessions', settings.endpoint, 'past-sessions'),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const primarySessions = (sessions.data ?? []).filter(isPrimarySession);
  const selectedSessionId = primarySessions.some((session) => session.id === sessionId)
    ? sessionId
    : (primarySessions[0]?.id ?? '');
  const search = useQuery({
    queryKey: queryKeys.key(
      'session-recall-search',
      settings.endpoint,
      selectedSessionId,
      submittedQuery,
      crossSession,
    ),
    queryFn: ({ signal }) =>
      repository.searchMemory(
        submittedQuery,
        { sessionId: selectedSessionId || undefined, includeCrossSession: crossSession },
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
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
        <div className="grid gap-2">
          <Label htmlFor="recall-session">Search in session</Label>
          <Select onValueChange={setSessionId} value={selectedSessionId}>
            <SelectTrigger className="w-full" id="recall-session">
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
          <Label htmlFor="recall-query">Find earlier evidence or decisions</Label>
          <div className="flex gap-2">
            <Input
              id="recall-query"
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
            <SearchResult hit={hit} key={`${hit.session_id}:${hit.message_id}:${hit.part_id}`} />
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
          <AlertTitle>Session search unavailable</AlertTitle>
          <AlertDescription>{search.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
