import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkRecord } from '@clio/core/v3';
import { ListChecksIcon, SquareIcon, SquareMinusIcon, SquareCheckIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function useSessionWork(sessionId: string, cursor = 0) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: ['session-work', settings.endpoint, sessionId, cursor],
    queryFn: ({ signal }) => repository.sessionWork(sessionId, cursor, signal),
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });
}

/** Compact entry to authoritative work state, independent of transcript expansion. */
export function SessionWorkSummary({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: () => void;
}) {
  const { data } = useSessionWork(sessionId);
  if (!data || (!data.goal && !data.loop && !data.todos.length)) return null;
  const current =
    data.goal?.state === 'active' || data.goal?.state === 'paused'
      ? data.goal
      : data.loop?.state === 'active' || data.loop?.state === 'paused'
        ? data.loop
        : undefined;
  const done = data.todos.filter((todo) => todo.status === 'completed').length;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className="h-auto w-full min-w-0 justify-start whitespace-normal text-left"
      aria-label="Open session Work"
      title={current?.title}
    >
      <ListChecksIcon data-icon="inline-start" />
      <span className="min-w-0 flex-1 truncate">
        {current
          ? `${current.state === 'paused' ? 'Paused' : 'Active'}: ${current.title}`
          : 'Session work'}
      </span>
      {data.todos.length ? (
        <span className="shrink-0">
          {done}/{data.todos.length} done
        </span>
      ) : null}
    </Button>
  );
}

function WorkRecordRow({ record }: { record: WorkRecord }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{record.state}</Badge>
        <span>{record.iterations} iterations</span>
      </div>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{record.title}</p>
      {record.reason ? (
        <p className="text-muted-foreground [overflow-wrap:anywhere]">{record.reason}</p>
      ) : null}
      {record.created_at ? (
        <time dateTime={record.created_at} className="text-muted-foreground">
          {new Date(record.created_at).toLocaleString()}
        </time>
      ) : null}
    </li>
  );
}

/** Inspect todos, goal/loop history, and schedules without changing runtime state. */
export function SessionWorkView({ sessionId }: { sessionId: string }) {
  const [cursor, setCursor] = useState(0);
  const query = useSessionWork(sessionId, cursor);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const schedules = useQuery({
    queryKey: ['session-work-schedules', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.scheduledTurns(sessionId, signal),
    refetchInterval: 5000,
  });
  if (query.isPending)
    return (
      <p role="status" className="p-4">
        Loading session work…
      </p>
    );
  if (query.error)
    return (
      <div role="alert" className="p-4">
        <p>Session work could not be loaded.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  const data = query.data;
  if (!data) return null;
  const next = data.goal_next_cursor ?? data.loop_next_cursor;
  return (
    <ScrollArea className="h-full min-h-0 min-w-0">
      <div
        className="flex min-w-0 flex-col gap-4 p-4 text-sm leading-6 [overflow-wrap:anywhere]"
        aria-label="Session work"
      >
        <section className="flex flex-col gap-2" aria-label="Todos">
          <h2 className="font-semibold">Todos</h2>
          {data.todos.length ? (
            <ul className="flex flex-col gap-2">
              {data.todos.map((todo, index) => {
                const Icon =
                  todo.status === 'completed'
                    ? SquareCheckIcon
                    : todo.status === 'in_progress'
                      ? SquareMinusIcon
                      : SquareIcon;
                const label =
                  todo.status === 'in_progress'
                    ? 'In progress'
                    : todo.status === 'completed'
                      ? 'Completed'
                      : 'Pending';
                return (
                  <li key={index} className="flex items-start gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label={label}
                            role="img"
                            tabIndex={0}
                            className="mt-1 inline-flex size-4 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <Icon
                              aria-hidden="true"
                              className={`size-4 ${todo.status === 'completed' ? 'text-success' : todo.status === 'in_progress' ? 'text-warning' : 'text-muted-foreground'}`}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span>{todo.content}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">No todos recorded.</p>
          )}
        </section>
        {(['goal', 'loop'] as const).map((kind) => (
          <section
            key={kind}
            className="flex flex-col gap-2"
            aria-label={kind === 'goal' ? 'Goals' : 'Loops'}
          >
            <h2 className="font-semibold">{kind === 'goal' ? 'Goals' : 'Loops'}</h2>
            <ul className="flex flex-col gap-2">
              {data[kind === 'goal' ? 'goals' : 'loops'].map((record) => (
                <WorkRecordRow key={record.id} record={record} />
              ))}
            </ul>
            {!data[kind] ? <p className="text-muted-foreground">No {kind} recorded.</p> : null}
          </section>
        ))}
        {cursor || next !== null ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!cursor}
              onClick={() => setCursor(Math.max(0, cursor - 25))}
            >
              Newer
            </Button>
            <Button
              variant="outline"
              disabled={next === null}
              onClick={() => {
                if (next !== null) setCursor(next);
              }}
            >
              Older
            </Button>
          </div>
        ) : null}
        <p className="text-muted-foreground">
          History retains goal and loop records from this version onward. Earlier overwritten
          records are unavailable. Stopped is not paused.
        </p>
        <section className="flex flex-col gap-2" aria-label="Schedules">
          <h2 className="font-semibold">Schedules</h2>
          {schedules.error ? (
            <p role="alert">Schedules could not be loaded.</p>
          ) : schedules.isPending ? (
            <p role="status">Loading schedules…</p>
          ) : schedules.data?.schedules.length ? (
            <ul className="flex flex-col gap-2">
              {schedules.data.schedules.map((schedule) => (
                <li key={schedule.id} className="rounded-md border p-3">
                  <Badge variant="outline">{schedule.enabled ? 'Scheduled' : 'Paused'}</Badge>
                  <p>{schedule.question}</p>
                  <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                    <span>
                      {schedule.next_fire_at
                        ? new Date(schedule.next_fire_at).toLocaleString()
                        : 'No next run'}
                    </span>
                    <span>{schedule.timezone}</span>
                  </p>
                  {schedule.last_error ? <p>{schedule.last_error}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No schedules recorded.</p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
