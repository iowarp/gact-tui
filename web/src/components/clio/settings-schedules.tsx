import { queryKeys } from '@/lib/query-keys';
import type { CreateScheduledTurnInput, ScheduledTurn } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  ChevronDownIcon,
  Clock3Icon,
  Repeat2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { isPrimarySession } from '@/lib/recent-sessions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';

type ScheduleKind = 'once' | 'repeating';
type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'advanced';

const weekdayLabels = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
] as const;

function defaultOnceAt() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string, timezone?: string) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function buildCron(preset: RepeatPreset, time: string, weekday: string, custom: string) {
  if (preset === 'advanced') return custom.trim();
  const [hour = '9', minute = '0'] = time.split(':');
  if (preset === 'weekdays') return `${Number(minute)} ${Number(hour)} * * 1-5`;
  if (preset === 'weekly') return `${Number(minute)} ${Number(hour)} * * ${weekday}`;
  return `${Number(minute)} ${Number(hour)} * * *`;
}

function repeatLabel(schedule: ScheduledTurn) {
  if (!schedule.recurring) return 'One time';
  if (/^\d+ \d+ \* \* 1-5$/u.test(schedule.cron)) return 'Weekdays';
  if (/^\d+ \d+ \* \* \*$/u.test(schedule.cron)) return 'Every day';
  if (/^\d+ \d+ \* \* [0-6]$/u.test(schedule.cron)) return 'Every week';
  return 'Custom repeat';
}

function SectionHeading() {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Scheduled work</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Ask an existing session to continue once or on a repeating schedule. Each instruction runs
        in that session with its existing agent, model, context, and access rules.
      </p>
    </header>
  );
}

export function ScheduleSettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [question, setQuestion] = useState('');
  const [kind, setKind] = useState<ScheduleKind>('once');
  const [onceAt, setOnceAt] = useState(defaultOnceAt);
  const [preset, setPreset] = useState<RepeatPreset>('weekdays');
  const [repeatTime, setRepeatTime] = useState('09:00');
  const [weekday, setWeekday] = useState('1');
  const [customCron, setCustomCron] = useState('');

  const sessions = useQuery({
    queryKey: queryKeys.key('sessions', 'all', settings.endpoint),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const availableSessions = useMemo(
    () => (sessions.data ?? []).filter((session) => !session.archived && isPrimarySession(session)),
    [sessions.data],
  );

  const selectedSessionId = availableSessions.some((session) => session.id === sessionId)
    ? sessionId
    : (availableSessions[0]?.id ?? '');

  const scheduleKey = ['scheduled-turns', settings.endpoint, selectedSessionId] as const;
  const scheduledTurns = useQuery({
    enabled: Boolean(selectedSessionId),
    queryKey: scheduleKey,
    queryFn: ({ signal }) => repository.scheduledTurns(selectedSessionId, signal),
  });
  const create = useMutation({
    mutationFn: (input: CreateScheduledTurnInput) =>
      repository.createScheduledTurn(selectedSessionId, input),
    onSuccess: async () => {
      setQuestion('');
      setOnceAt(defaultOnceAt());
      await queryClient.invalidateQueries({ queryKey: scheduleKey });
      toast.success('Scheduled work created');
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (scheduleId: string) => repository.deleteScheduledTurn(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKey });
      toast.success('Scheduled work cancelled');
    },
    onError: (error) => toast.error(error.message),
  });

  const workspaceNameById = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace.display_name]),
  );
  const cron = buildCron(preset, repeatTime, weekday, customCron);
  const canCreate =
    Boolean(selectedSessionId && question.trim()) &&
    (kind === 'once'
      ? Boolean(onceAt && !Number.isNaN(new Date(onceAt).getTime()))
      : Boolean(cron));
  const submit = () => {
    if (!canCreate) return;
    create.mutate(
      kind === 'once'
        ? {
            question: question.trim(),
            run_at: new Date(onceAt).toISOString(),
            recurring: false,
            overlap_policy: 'queue',
          }
        : {
            question: question.trim(),
            cron,
            recurring: true,
            timezone: scheduledTurns.data?.timezone,
            overlap_policy: 'queue',
          },
    );
  };

  return (
    <div className="grid gap-6">
      <SectionHeading />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>New scheduled instruction</FrameTitle>
          <FrameDescription>
            The connected service owns timing and execution. Closing this app will not cancel it.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="schedule-session">Session</Label>
            <Select onValueChange={setSessionId} value={selectedSessionId}>
              <SelectTrigger id="schedule-session">
                <SelectValue placeholder="Choose a session" />
              </SelectTrigger>
              <SelectContent>
                {availableSessions.map((session) => {
                  const sessionTitle = session.title || 'Untitled session';
                  const workspaceName = workspaceNameById.get(session.workspace_id);
                  return (
                    <SelectItem
                      key={session.id}
                      textValue={workspaceName ? `${sessionTitle}, ${workspaceName}` : sessionTitle}
                      value={session.id}
                    >
                      <span className="sr-only">
                        {workspaceName ? `${sessionTitle}, ${workspaceName}` : sessionTitle}
                      </span>
                      <span aria-hidden="true" className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{sessionTitle}</span>
                        {workspaceName ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {workspaceName}
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-instruction">Instruction</Label>
            <Textarea
              id="schedule-instruction"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Review new campaign results and summarize material changes."
              rows={4}
              value={question}
            />
          </div>
          <RadioGroup
            className="grid gap-3 sm:grid-cols-2"
            onValueChange={(value) => setKind(value as ScheduleKind)}
            value={kind}
          >
            <Label className="rounded-xl border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <span className="flex items-center gap-3">
                <RadioGroupItem value="once" />
                <Clock3Icon aria-hidden="true" className="size-4 text-primary" />
                <span>
                  <span className="block font-medium">Once</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Continue at a specific date and time.
                  </span>
                </span>
              </span>
            </Label>
            <Label className="rounded-xl border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <span className="flex items-center gap-3">
                <RadioGroupItem value="repeating" />
                <Repeat2Icon aria-hidden="true" className="size-4 text-primary" />
                <span>
                  <span className="block font-medium">Repeats</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Continue on a daily or weekly rhythm.
                  </span>
                </span>
              </span>
            </Label>
          </RadioGroup>
          {kind === 'once' ? (
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="schedule-once-at">Date and time</Label>
              <Input
                id="schedule-once-at"
                min={defaultOnceAt()}
                onChange={(event) => setOnceAt(event.target.value)}
                type="datetime-local"
                value={onceAt}
              />
              <p className="text-xs text-muted-foreground">Shown in your device time zone.</p>
            </div>
          ) : (
            <div className="grid gap-4 rounded-xl border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="schedule-repeat">Repeat</Label>
                  <Select
                    onValueChange={(value) => setPreset(value as RepeatPreset)}
                    value={preset}
                  >
                    <SelectTrigger id="schedule-repeat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Every day</SelectItem>
                      <SelectItem value="weekdays">Weekdays</SelectItem>
                      <SelectItem value="weekly">Every week</SelectItem>
                      <SelectItem value="advanced">Advanced schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {preset !== 'advanced' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="schedule-repeat-time">Time</Label>
                    <Input
                      id="schedule-repeat-time"
                      onChange={(event) => setRepeatTime(event.target.value)}
                      type="time"
                      value={repeatTime}
                    />
                  </div>
                ) : null}
              </div>
              {preset === 'weekly' ? (
                <div className="grid gap-2 sm:max-w-xs">
                  <Label htmlFor="schedule-weekday">Day</Label>
                  <Select onValueChange={setWeekday} value={weekday}>
                    <SelectTrigger id="schedule-weekday">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weekdayLabels.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {preset === 'advanced' ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button className="w-full justify-between" type="button" variant="ghost">
                      Advanced timing
                      <ChevronDownIcon aria-hidden="true" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-2 pt-3">
                    <Label htmlFor="schedule-expression">Five-part schedule expression</Label>
                    <Input
                      className="font-mono"
                      id="schedule-expression"
                      onChange={(event) => setCustomCron(event.target.value)}
                      placeholder="0 9 * * 1-5"
                      value={customCron}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used only when the presets do not describe the timing you need.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Service time zone: {scheduledTurns.data?.timezone ?? 'Loading…'}
              </p>
            </div>
          )}
        </FramePanel>
        <FrameFooter className="justify-end">
          <Button disabled={!canCreate || create.isPending} onClick={submit} type="button">
            <CalendarClockIcon aria-hidden="true" />
            {create.isPending ? 'Scheduling…' : 'Schedule work'}
          </Button>
        </FrameFooter>
      </Frame>

      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Upcoming work</FrameTitle>
          <FrameDescription>
            Live schedules for the selected session, including the next server-reported run.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-2 p-2">
          {scheduledTurns.data?.schedules.map((schedule) => (
            <ClioInteractiveRow
              actions={
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      aria-label={`Cancel scheduled work: ${schedule.question}`}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this scheduled work?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Future runs will be removed. Work that already completed remains in the
                        session history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep schedule</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => remove.mutate(schedule.id)}
                        variant="destructive"
                      >
                        Cancel scheduled work
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
              key={schedule.id}
            >
              <div className="flex items-start gap-3">
                {schedule.recurring ? (
                  <Repeat2Icon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                ) : (
                  <Clock3Icon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{schedule.question}</p>
                    <ClioStatus
                      detail={schedule.disabled_reason || schedule.last_error || undefined}
                      label={schedule.enabled ? 'Scheduled' : 'Paused'}
                      value={schedule.enabled ? 'healthy' : 'degraded'}
                    />
                    <Badge variant="outline">{repeatLabel(schedule)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Next run:{' '}
                    <time dateTime={schedule.next_fire_at || schedule.run_at}>
                      {formatDateTime(
                        schedule.next_fire_at || schedule.run_at,
                        schedule.timezone || scheduledTurns.data.timezone,
                      )}
                    </time>
                    {schedule.timezone ? `, ${schedule.timezone}` : ''}
                  </p>
                  {schedule.fire_count ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Completed {schedule.fire_count} scheduled{' '}
                      {schedule.fire_count === 1 ? 'run' : 'runs'}
                      {schedule.last_fired_at
                        ? `, last ${formatDateTime(schedule.last_fired_at, schedule.timezone)}`
                        : ''}
                    </p>
                  ) : null}
                  {schedule.last_error ? (
                    <p className="mt-2 text-xs text-destructive">{schedule.last_error}</p>
                  ) : null}
                </div>
              </div>
            </ClioInteractiveRow>
          ))}
          {!scheduledTurns.isPending && !scheduledTurns.data?.schedules.length ? (
            <div className="grid place-items-center gap-2 rounded-lg border p-10 text-center">
              <CalendarClockIcon aria-hidden="true" className="size-6 text-muted-foreground" />
              <p className="font-medium">Nothing is scheduled for this session</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create a one-time or repeating instruction above. The run will appear in the session
                when it starts.
              </p>
            </div>
          ) : null}
          {scheduledTurns.error ? (
            <Alert variant="destructive">
              <AlertTitle>Scheduled work unavailable</AlertTitle>
              <AlertDescription>{scheduledTurns.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}
