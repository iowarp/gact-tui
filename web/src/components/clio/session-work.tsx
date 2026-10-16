import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkRecord, WorkScheduleHistory, WorkTodo, WorkTodoSnapshot } from '@clio/core/v3';
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CirclePauseIcon,
  CircleStopIcon,
  ListChecksIcon,
} from 'lucide-react';
import { DeleteIcon, GoalIcon, LoopIcon, ScheduleIcon } from '@/lib/icon-vocabulary';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { RefreshButton } from './refresh-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSessionWork } from './use-session-work';
import { WorkRecordControls } from './work-record-controls';
import { useEvidenceDisclosure } from '@/hooks/use-evidence-disclosures';
import { TodoList, TodoStatusIcon } from './todo-list';
import { todoCurrentSummary } from './todo-list-summary';
import { OpenQuestionsSection } from './open-question-list';

/** Keep parked goals and future monitoring visible in the bottom work finder. */
export function SessionWorkStatus({
  sessionId,
  onOpen,
  fallback,
}: {
  sessionId: string;
  onOpen: () => void;
  fallback: string;
}) {
  const { data } = useSessionWork(sessionId);
  return data && (data.goal || data.loop || data.schedules.length) ? (
    <div className="flex h-6 min-w-0 max-w-96 items-center">
      <SessionWorkSummary sessionId={sessionId} onOpen={onOpen} compact />
    </div>
  ) : (
    <span>{fallback}</span>
  );
}

/** Compact entry to authoritative work state, independent of transcript expansion. */
export function SessionWorkSummary({
  sessionId,
  onOpen,
  includeTodos = true,
  compact = false,
}: {
  sessionId: string;
  onOpen: () => void;
  includeTodos?: boolean;
  compact?: boolean;
}) {
  const { data } = useSessionWork(sessionId);
  if (!data || (!data.goal && !data.loop && !data.todos.length && !data.schedules.length))
    return null;
  const current =
    data.goal?.state === 'active' || data.goal?.state === 'paused'
      ? data.goal
      : data.loop?.state === 'active' || data.loop?.state === 'paused'
        ? data.loop
        : (data.goal ?? data.loop ?? undefined);
  const scheduledCount = data.schedules.filter((schedule) => schedule.enabled).length;
  const otherLoop = current === data.goal && data.loop?.state === 'active';
  const kind =
    current === data.goal ? 'goal' : current ? 'loop' : scheduledCount ? 'schedule' : 'todo';
  const Icon =
    kind === 'goal'
      ? GoalIcon
      : kind === 'loop'
        ? LoopIcon
        : kind === 'schedule'
          ? ScheduleIcon
          : ListChecksIcon;
  const state =
    current?.state === 'active'
      ? current.phase === 'waiting'
        ? 'waiting'
        : current.phase === 'judging'
          ? 'checking completion'
          : current.phase === 'needs_input'
            ? 'needs input'
            : 'active'
      : current?.state;
  if (!includeTodos && !current && !scheduledCount) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className={cn(
        'max-w-full min-w-0 justify-start gap-2 px-0 text-left',
        compact ? 'h-6 text-[0.625rem]' : 'h-7 text-xs',
      )}
      aria-label="Open session Work"
      title={current?.title}
      data-work-kind={kind}
    >
      <Icon aria-hidden="true" className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} />
      <span className="min-w-0 flex-1 truncate">
        {current
          ? `${kind === 'goal' ? 'Goal' : 'Loop'} ${state}: ${current.title}`
          : data.schedules.some((schedule) => schedule.enabled)
            ? 'Scheduled work'
            : 'Todos'}
      </span>
      {otherLoop ? <span className="shrink-0">Loop</span> : null}
      {scheduledCount ? (
        <span className="shrink-0">
          {scheduledCount} {scheduledCount === 1 ? 'schedule' : 'schedules'}
        </span>
      ) : null}
      {includeTodos && data.todos.length ? (
        <span className={cn('shrink-0 text-muted-foreground', compact && 'hidden sm:inline')}>
          {current || scheduledCount ? 'Todos: ' : ''}
          {todoCurrentSummary(data.todos, (todo) => todo.status)}
        </span>
      ) : null}
    </Button>
  );
}

function workReasonLabel(reason: string): string {
  return (
    {
      goal_met: 'Goal met',
      goal_cleared: 'Goal cleared',
      goal_abandoned: 'Goal abandoned',
      loop_user_stopped: 'Stopped by agent',
      loop_max_iters: 'Iteration limit reached',
      loop_wallclock_budget: 'Time limit reached',
      loop_token_budget: 'Token limit reached',
    }[reason] ?? reason.replaceAll('_', ' ')
  );
}

function WorkRecordRow({
  record,
  sessionId,
  kind,
}: {
  record: WorkRecord;
  sessionId: string;
  kind: 'goal' | 'loop';
}) {
  const Icon =
    record.state === 'completed'
      ? CircleCheckIcon
      : record.state === 'stopped'
        ? CircleStopIcon
        : record.state === 'paused'
          ? CirclePauseIcon
          : CircleDotIcon;
  const phase = record.state === 'active' && record.phase ? record.phase : record.state;
  const state =
    phase === 'judging'
      ? 'Checking goal completion'
      : phase.charAt(0).toUpperCase() + phase.slice(1).replaceAll('_', ' ');
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {state}
        </span>
        <span>
          {record.iterations} {record.iterations === 1 ? 'iteration' : 'iterations'}
        </span>
        {record.created_at ? (
          <time dateTime={record.created_at}>{new Date(record.created_at).toLocaleString()}</time>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{record.title}</p>
      {record.reason ? (
        <p className="text-muted-foreground [overflow-wrap:anywhere]">
          {workReasonLabel(record.reason)}
        </p>
      ) : null}
      <WorkRecordControls sessionId={sessionId} kind={kind} record={record} />
    </li>
  );
}

function PreviousRecords({
  count,
  noun,
  children,
}: {
  count: number;
  noun: string;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Previous ${count} ${noun}`}
          className="group h-7 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Previous
          <span className="font-normal">{count}</span>
          <ChevronDownIcon
            data-icon="inline-end"
            aria-hidden="true"
            className="transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 border-l pl-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function WorkSection({
  title,
  summary,
  hasContent,
  children,
}: {
  title: string;
  summary: string;
  hasContent: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useEvidenceDisclosure(`work-view:${title}`);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        aria-label={title}
        className={cn(
          'group/work-section flex min-h-0 min-w-0 flex-col border-b last:border-b-0',
          hasContent && 'shrink-0',
        )}
      >
        {/* The WAI-ARIA disclosure pattern nests an accordion trigger in a
            heading so the section is reachable by heading navigation;
            `contents` keeps the h3 out of the flex layout it wraps. */}
        <h3 className="contents">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={`${title}: ${summary}`}
              className="group h-9 w-full shrink-0 justify-start rounded-none px-0 hover:bg-transparent"
            >
              <span className="font-semibold">{title}</span>
              <span className="ml-auto font-normal text-muted-foreground">{summary}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent className="min-h-0 overflow-hidden">
          <ScrollArea
            className="max-h-[32rem] min-h-0"
            data-slot="work-section-scroll"
            viewportProps={{ className: 'max-h-[32rem] pr-3' }}
          >
            <div className="flex min-w-0 flex-col gap-2 pb-3">{children}</div>
          </ScrollArea>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function TodoRow({ todo }: { todo: WorkTodo }) {
  const label =
    todo.status === 'in_progress'
      ? 'In progress'
      : todo.status === 'completed'
        ? 'Completed'
        : 'Pending';
  return (
    <li className="flex items-start gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={label}
              role="img"
              tabIndex={0}
              className="mt-1 inline-flex size-4 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <TodoStatusIcon state={todo.status} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span>{todo.content}</span>
    </li>
  );
}

function TodoSnapshotRow({ snapshot }: { snapshot: WorkTodoSnapshot }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 py-1.5">
      {snapshot.created_at ? (
        <time className="text-muted-foreground" dateTime={snapshot.created_at}>
          {new Date(snapshot.created_at).toLocaleString()}
        </time>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {snapshot.items.map((todo, index) => (
          <TodoRow key={`${todo.content}-${index}`} todo={todo} />
        ))}
      </ul>
    </li>
  );
}

function PreviousScheduleRow({ schedule }: { schedule: WorkScheduleHistory }) {
  const state = schedule.state.charAt(0).toUpperCase() + schedule.state.slice(1);
  const recordedAt = schedule.ended_at || schedule.created_at;
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-1.5">
      <p className="font-medium">{schedule.question}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
        <span className="text-foreground">{state}</span>
        {recordedAt ? (
          <time dateTime={recordedAt}>{new Date(recordedAt).toLocaleString()}</time>
        ) : null}
      </p>
      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
        {schedule.next_fire_at ? (
          <span>{new Date(schedule.next_fire_at).toLocaleString()}</span>
        ) : null}
        {schedule.timezone ? <span>Time zone: {schedule.timezone}</span> : null}
      </p>
    </li>
  );
}

/** Inspect todos, goal/loop history, and schedules without changing runtime state. */
export function SessionWorkView({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="max-h-[45%] shrink-0 overflow-y-auto px-4">
        <OpenQuestionsSection />
      </div>
      <div className="min-h-0 flex-1">
        <SessionWorkInventory sessionId={sessionId} />
      </div>
    </div>
  );
}

function SessionWorkInventory({ sessionId }: { sessionId: string }) {
  const [cursor, setCursor] = useState(0);
  const query = useSessionWork(sessionId, cursor);
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const scheduleKey = ['session-work-schedules', settings.endpoint, sessionId] as const;
  const schedules = useQuery({
    queryKey: scheduleKey,
    queryFn: ({ signal }) => repository.scheduledTurns(sessionId, signal),
    refetchInterval: 5000,
  });
  const removeSchedule = useMutation({
    mutationFn: (scheduleId: string) => repository.deleteScheduledTurn(scheduleId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleKey }),
        queryClient.invalidateQueries({
          queryKey: ['session-work', settings.endpoint, sessionId],
        }),
      ]);
    },
  });
  const toggleSchedule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      repository.setScheduleEnabled(sessionId, id, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKey });
      await queryClient.invalidateQueries({
        queryKey: ['session-work', settings.endpoint, sessionId],
      });
    },
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
        <RefreshButton
          label="Retry"
          variant="outline"
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
        />
      </div>
    );
  const data = query.data;
  if (!data) return null;
  const next =
    data.goal_next_cursor ??
    data.loop_next_cursor ??
    data.todo_history_next_cursor ??
    data.schedule_history_next_cursor;
  const activeScheduleCount = schedules.data?.schedules.length ?? 0;
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto px-4 text-sm leading-6 [overflow-wrap:anywhere]"
      aria-label="Session work"
    >
      <WorkSection
        title="Todos"
        summary={
          data.todos.length ? todoCurrentSummary(data.todos, (todo) => todo.status) : 'None current'
        }
        hasContent={Boolean(data.todos.length || data.todo_history.length)}
      >
        {data.todos.length ? (
          <TodoList
            items={data.todos}
            status={(todo) => todo.status}
            scope="work"
            renderItem={(todo, index) => <TodoRow key={`${todo.content}-${index}`} todo={todo} />}
          />
        ) : (
          <p className="text-muted-foreground">
            {data.todo_history.length ? 'No current todos.' : 'No todos recorded.'}
          </p>
        )}
        <PreviousRecords count={data.todo_history.length} noun="todo lists">
          <ul className="flex flex-col gap-2">
            {data.todo_history.map((snapshot) => (
              <TodoSnapshotRow key={snapshot.id} snapshot={snapshot} />
            ))}
          </ul>
        </PreviousRecords>
      </WorkSection>
      {(['goal', 'loop'] as const).map((kind) => {
        const current = data[kind];
        const currentIsActive = current?.state === 'active' || current?.state === 'paused';
        const records = data[kind === 'goal' ? 'goals' : 'loops'];
        const previous = records.filter((record) => !currentIsActive || record.id !== current?.id);
        return (
          <WorkSection
            key={kind}
            title={kind === 'goal' ? 'Goals' : 'Loops'}
            summary={
              currentIsActive
                ? current.state.charAt(0).toUpperCase() + current.state.slice(1)
                : 'None active'
            }
            hasContent={Boolean(currentIsActive || previous.length)}
          >
            {currentIsActive && current ? (
              <ul>
                <WorkRecordRow record={current} sessionId={sessionId} kind={kind} />
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {previous.length ? `No active ${kind}.` : `No ${kind} recorded.`}
              </p>
            )}
            <PreviousRecords count={previous.length} noun={`${kind} records`}>
              <ul className="flex flex-col gap-2">
                {previous.map((record) => (
                  <WorkRecordRow
                    key={record.id}
                    record={record}
                    sessionId={sessionId}
                    kind={kind}
                  />
                ))}
              </ul>
            </PreviousRecords>
          </WorkSection>
        );
      })}
      <WorkSection
        title="Schedules"
        summary={activeScheduleCount ? `${activeScheduleCount} active` : 'None active'}
        hasContent={Boolean(activeScheduleCount || data.schedule_history.length)}
      >
        {schedules.error ? (
          <p role="alert">Schedules could not be loaded.</p>
        ) : schedules.isPending ? (
          <p role="status">Loading schedules…</p>
        ) : schedules.data?.schedules.length ? (
          <ul className="flex flex-col gap-2">
            {schedules.data.schedules.map((schedule) => (
              <li key={schedule.id} className="flex min-w-0 items-start gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{schedule.question}</p>
                  <p className="inline-flex items-center gap-1 text-muted-foreground">
                    {schedule.enabled ? (
                      <CircleCheckIcon aria-hidden="true" className="size-4" />
                    ) : (
                      <CirclePauseIcon aria-hidden="true" className="size-4" />
                    )}
                    {schedule.enabled ? 'Scheduled' : 'Paused'}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                    <span>
                      {schedule.next_fire_at
                        ? new Date(schedule.next_fire_at).toLocaleString()
                        : 'No next run'}
                    </span>
                    <span>Time zone: {schedule.timezone}</span>
                  </p>
                  {schedule.last_error ? <p>{schedule.last_error}</p> : null}
                  <details className="text-muted-foreground">
                    <summary className="cursor-pointer">Details</summary>
                    <p>Run limit: {schedule.max_fires || 'Unlimited'}</p>
                    <p>Completed runs: {schedule.fire_count}</p>
                    <p>Deadline: {schedule.until || 'None'}</p>
                  </details>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={toggleSchedule.isPending}
                    onClick={() =>
                      toggleSchedule.mutate({ id: schedule.id, enabled: !schedule.enabled })
                    }
                  >
                    {schedule.enabled ? 'Stop' : 'Restart'}
                  </Button>
                  {toggleSchedule.error ? <p role="alert">{toggleSchedule.error.message}</p> : null}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      aria-label={`Cancel schedule: ${schedule.question}`}
                      className="size-7 shrink-0"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <DeleteIcon aria-hidden="true" className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this schedule?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Future runs will stop. Completed work remains in this session history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep schedule</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={removeSchedule.isPending}
                        onClick={() => removeSchedule.mutate(schedule.id)}
                        variant="destructive"
                      >
                        Cancel schedule
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {data.schedule_history.length ? 'No active schedules.' : 'No schedules recorded.'}
          </p>
        )}
        <PreviousRecords count={data.schedule_history.length} noun="schedule records">
          <ul className="flex flex-col gap-2">
            {data.schedule_history.map((schedule) => (
              <PreviousScheduleRow key={schedule.id} schedule={schedule} />
            ))}
          </ul>
        </PreviousRecords>
      </WorkSection>
      {cursor || next !== null ? (
        <div className="flex shrink-0 items-center gap-2 py-2">
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
    </div>
  );
}
