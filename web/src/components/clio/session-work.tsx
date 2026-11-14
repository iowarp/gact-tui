import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSessionWork } from './use-session-work';
import { useSessionSchedules } from './session-inventory-queries';
import { WorkRecordControls } from './work-record-controls';
import { TodoList, TodoStatusIcon } from './todo-list';
import { todoCurrentSummary } from './todo-list-summary';
import { SessionAccess } from './session-access';
import { StateView } from './primitives/state-view';
import { SessionPlanBody } from './session-plan-section';
import { planStatusLabel } from '@/lib/plan-status';
import { plural, t, ph } from '@lingui/core/macro';
import { formatDateTime } from '@/lib/locale-format';
import { Trans } from '@lingui/react/macro';

/** Keep parked goals and future monitoring visible in the top bar. */
export function SessionWorkStatus({
  sessionId,
  onOpen,
  fallback,
}: {
  sessionId: string;
  onOpen: () => void;
  fallback?: string;
}) {
  const { data } = useSessionWork(sessionId);
  return data && (data.goal || data.loop || data.schedules.length) ? (
    <div className="flex h-7 min-w-0 max-w-48 items-center xl:max-w-72">
      <SessionWorkSummary sessionId={sessionId} onOpen={onOpen} compact />
    </div>
  ) : fallback ? (
    <span>{fallback}</span>
  ) : null;
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
  if (!includeTodos && !current && !scheduledCount) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className={cn(
        'max-w-full min-w-0 justify-start gap-2 px-0 text-left',
        compact ? 'h-7 px-1.5 text-meta' : 'h-7 text-xs',
      )}
      aria-label={t`Open session Work`}
      title={current?.title}
      data-work-kind={kind}
    >
      <Icon aria-hidden="true" className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} />
      <span className="min-w-0 flex-1 truncate">
        {current
          ? kind === 'goal'
            ? t`Goal ${ph({ state: summaryStateLabel(current) })}: ${ph({ title: current.title })}`
            : t`Loop ${ph({ state: summaryStateLabel(current) })}: ${ph({ title: current.title })}`
          : data.schedules.some((schedule) => schedule.enabled)
            ? t`Scheduled work`
            : t`Todos`}
      </span>
      {otherLoop ? <span className="shrink-0">{t`Loop`}</span> : null}
      {scheduledCount ? (
        <span className="shrink-0">
          {plural(scheduledCount, { one: '# schedule', other: '# schedules' })}
        </span>
      ) : null}
      {includeTodos && data.todos.length ? (
        <span className={cn('shrink-0 text-muted-foreground', compact && 'hidden sm:inline')}>
          {current || scheduledCount
            ? t`Todos: ${ph({ summary: todoCurrentSummary(data.todos, (todo) => todo.status) })}`
            : todoCurrentSummary(data.todos, (todo) => todo.status)}
        </span>
      ) : null}
    </Button>
  );
}

/** Lower-case state of the current goal or loop, as the summary row reads it (`Goal waiting: …`). */
function summaryStateLabel(record: WorkRecord): string {
  if (record.state === 'active') {
    if (record.phase === 'waiting') return t({ message: 'waiting', context: 'goal or loop state' });
    if (record.phase === 'judging') return t`checking completion`;
    if (record.phase === 'needs_input') return t`needs input`;
    return t({ message: 'active', context: 'goal or loop state' });
  }
  return {
    paused: t({ message: 'paused', context: 'goal or loop state' }),
    completed: t({ message: 'completed', context: 'goal or loop state' }),
    stopped: t({ message: 'stopped', context: 'goal or loop state' }),
    superseded: t({ message: 'superseded', context: 'goal or loop state' }),
  }[record.state];
}

/** Capitalized label for a work record state or phase; an unknown phase reads as recorded. */
function workPhaseLabel(phase: string): string {
  const known: Record<string, string> = {
    active: t`Active`,
    paused: t`Paused`,
    completed: t`Completed`,
    stopped: t`Stopped`,
    superseded: t`Superseded`,
    waiting: t`Waiting`,
    judging: t`Checking goal completion`,
    needs_input: t`Needs input`,
  };
  return known[phase] ?? phase.charAt(0).toUpperCase() + phase.slice(1).replaceAll('_', ' ');
}

function scheduleStateLabel(state: WorkScheduleHistory['state']): string {
  return {
    scheduled: t`Scheduled`,
    paused: t`Paused`,
    completed: t`Completed`,
    stopped: t`Stopped`,
    deleted: t`Deleted`,
  }[state];
}

function workReasonLabel(reason: string): string {
  return (
    {
      goal_met: t`Goal met`,
      goal_cleared: t`Goal cleared`,
      goal_abandoned: t`Goal abandoned`,
      loop_user_stopped: t`Stopped by agent`,
      loop_max_iters: t`Iteration limit reached`,
      loop_wallclock_budget: t`Time limit reached`,
      loop_token_budget: t`Token limit reached`,
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
  const state = workPhaseLabel(phase);
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {state}
        </span>
        <span>{plural(record.iterations, { one: '# iteration', other: '# iterations' })}</span>
        {record.created_at ? (
          <time dateTime={record.created_at}>{formatDateTime(record.created_at)}</time>
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
  label,
  children,
}: {
  count: number;
  /** Accessible name naming what the earlier records are (`Previous 2 goal records`). */
  label: string;
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
          aria-label={label}
          className="group h-7 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <Trans>
            Previous
            <span className="font-normal">{count}</span>
          </Trans>
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

/** One kind of work: a plain heading with its state, then its records. */
function WorkSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 shrink-0 flex-col pb-3">
      <h3 className="flex h-8 min-w-0 items-center gap-2 text-menu">
        <span className="font-semibold">{title}</span>
        <span className="ml-auto truncate font-normal text-muted-foreground">{summary}</span>
      </h3>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </section>
  );
}
function TodoRow({ todo }: { todo: WorkTodo }) {
  const label =
    todo.status === 'in_progress'
      ? t`In progress`
      : todo.status === 'completed'
        ? t`Completed`
        : t`Pending`;
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
          {formatDateTime(snapshot.created_at)}
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
  const state = scheduleStateLabel(schedule.state);
  const recordedAt = schedule.ended_at || schedule.created_at;
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-1.5">
      <p className="font-medium">{schedule.question}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
        <span className="text-foreground">{state}</span>
        {recordedAt ? <time dateTime={recordedAt}>{formatDateTime(recordedAt)}</time> : null}
      </p>
      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
        {schedule.next_fire_at ? <span>{formatDateTime(schedule.next_fire_at)}</span> : null}
        {schedule.timezone ? (
          <span>{t`Time zone: ${ph({ timezone: schedule.timezone })}`}</span>
        ) : null}
      </p>
    </li>
  );
}

/**
 * Inspect the plan, todos, goal/loop history and schedules. Open questions
 * are Activity rows; only kinds with records show, and one empty state
 * stands for a session that has none.
 */
export function SessionWorkView({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <SessionWorkInventory sessionId={sessionId} />
    </div>
  );
}

function SessionWorkInventory({ sessionId }: { sessionId: string }) {
  const [cursor, setCursor] = useState(0);
  const query = useSessionWork(sessionId, cursor);
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const schedules = useSessionSchedules(sessionId);
  const scheduleKey = ['session-work-schedules', settings.endpoint, sessionId] as const;
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
        {t`Loading session work…`}
      </p>
    );
  if (query.error)
    return (
      <div role="alert" className="p-4">
        <p>{t`Session work could not be loaded.`}</p>
        <RefreshButton
          label={t`Retry`}
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
  const hasTodos = Boolean(data.todos.length || data.todo_history.length);
  const hasSchedules = Boolean(
    activeScheduleCount || data.schedule_history.length || schedules.error || data.schedules.length,
  );
  const hasRecords = (kind: 'goal' | 'loop') =>
    Boolean(data[kind] || data[kind === 'goal' ? 'goals' : 'loops'].length);
  const empty =
    !data.plan && !hasTodos && !hasRecords('goal') && !hasRecords('loop') && !hasSchedules;
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto px-4 text-sm leading-6 [overflow-wrap:anywhere]"
      aria-label={t`Session work`}
    >
      <SessionAccess sessionId={sessionId} />
      {data.plan ? (
        <WorkSection title={t`Plan`} summary={planStatusLabel(data.plan.status)}>
          <SessionPlanBody plan={data.plan} sessionId={sessionId} />
        </WorkSection>
      ) : null}
      {empty ? (
        <StateView
          className="p-6"
          detail={t`Plans, todos, goals, loops and schedules appear here once the agent records them.`}
          kind="empty"
          size="panel"
          title={t`No work recorded`}
        />
      ) : null}
      {hasTodos ? (
        <WorkSection
          title={t`Todos`}
          summary={
            data.todos.length
              ? todoCurrentSummary(data.todos, (todo) => todo.status)
              : t`None current`
          }
        >
          {data.todos.length ? (
            <TodoList
              items={data.todos}
              status={(todo) => todo.status}
              scope="work"
              renderItem={(todo, index) => <TodoRow key={`${todo.content}-${index}`} todo={todo} />}
            />
          ) : null}
          <PreviousRecords
            count={data.todo_history.length}
            label={plural(data.todo_history.length, {
              one: 'Previous # todo list',
              other: 'Previous # todo lists',
            })}
          >
            <ul className="flex flex-col gap-2">
              {data.todo_history.map((snapshot) => (
                <TodoSnapshotRow key={snapshot.id} snapshot={snapshot} />
              ))}
            </ul>
          </PreviousRecords>
        </WorkSection>
      ) : null}
      {(['goal', 'loop'] as const).map((kind) => {
        if (!hasRecords(kind)) return null;
        const current = data[kind];
        const currentIsActive = current?.state === 'active' || current?.state === 'paused';
        const records = data[kind === 'goal' ? 'goals' : 'loops'];
        const previous = records.filter((record) => !currentIsActive || record.id !== current?.id);
        return (
          <WorkSection
            key={kind}
            title={kind === 'goal' ? t`Goals` : t`Loops`}
            summary={currentIsActive ? workPhaseLabel(current.state) : t`None active`}
          >
            {currentIsActive && current ? (
              <ul>
                <WorkRecordRow record={current} sessionId={sessionId} kind={kind} />
              </ul>
            ) : null}
            <PreviousRecords
              count={previous.length}
              label={
                kind === 'goal'
                  ? plural(previous.length, {
                      one: 'Previous # goal record',
                      other: 'Previous # goal records',
                    })
                  : plural(previous.length, {
                      one: 'Previous # loop record',
                      other: 'Previous # loop records',
                    })
              }
            >
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
      {hasSchedules ? (
        <WorkSection
          title={t`Schedules`}
          summary={activeScheduleCount ? t`${activeScheduleCount} active` : t`None active`}
        >
          {schedules.error ? (
            <p role="alert">{t`Schedules could not be loaded.`}</p>
          ) : schedules.isPending ? (
            <p role="status">{t`Loading schedules…`}</p>
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
                      {schedule.enabled ? t`Scheduled` : t`Paused`}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                      <span>
                        {schedule.next_fire_at
                          ? formatDateTime(schedule.next_fire_at)
                          : t`No next run`}
                      </span>
                      <span>{t`Time zone: ${ph({ timezone: schedule.timezone })}`}</span>
                    </p>
                    {schedule.last_error ? <p>{schedule.last_error}</p> : null}
                    <details className="text-muted-foreground">
                      <summary className="cursor-pointer">{t`Details`}</summary>
                      <p>
                        {schedule.max_fires
                          ? t`Run limit: ${ph({ max_fires: schedule.max_fires })}`
                          : t`Run limit: Unlimited`}
                      </p>
                      <p>{t`Completed runs: ${ph({ fire_count: schedule.fire_count })}`}</p>
                      <p>
                        {schedule.until
                          ? t`Deadline: ${ph({ until: schedule.until })}`
                          : t`Deadline: None`}
                      </p>
                    </details>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={toggleSchedule.isPending}
                      onClick={() =>
                        toggleSchedule.mutate({ id: schedule.id, enabled: !schedule.enabled })
                      }
                    >
                      {schedule.enabled ? t`Stop` : t`Restart`}
                    </Button>
                    {toggleSchedule.error ? (
                      <p role="alert">{toggleSchedule.error.message}</p>
                    ) : null}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        aria-label={t`Cancel schedule: ${ph({ question: schedule.question })}`}
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
                        <AlertDialogTitle>{t`Cancel this schedule?`}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t`Future runs will stop. Completed work remains in this session history.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t`Keep schedule`}</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={removeSchedule.isPending}
                          onClick={() => removeSchedule.mutate(schedule.id)}
                          variant="destructive"
                        >
                          {t`Cancel schedule`}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          ) : null}
          <PreviousRecords
            count={data.schedule_history.length}
            label={plural(data.schedule_history.length, {
              one: 'Previous # schedule record',
              other: 'Previous # schedule records',
            })}
          >
            <ul className="flex flex-col gap-2">
              {data.schedule_history.map((schedule) => (
                <PreviousScheduleRow key={schedule.id} schedule={schedule} />
              ))}
            </ul>
          </PreviousRecords>
        </WorkSection>
      ) : null}
      {cursor || next !== null ? (
        <div className="flex shrink-0 items-center gap-2 py-2">
          <Button
            variant="outline"
            disabled={!cursor}
            onClick={() => setCursor(Math.max(0, cursor - 25))}
          >
            {t`Newer`}
          </Button>
          <Button
            variant="outline"
            disabled={next === null}
            onClick={() => {
              if (next !== null) setCursor(next);
            }}
          >
            {t`Older`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
