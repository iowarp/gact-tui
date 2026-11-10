import type { CreateScheduledTurnInput, ScheduledTurn } from '@clio/core/v3';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScheduleIcon } from '@/lib/icon-vocabulary';
import { DateTimeField } from './date-time-field';
import { DialogFrame } from './primitives/dialog-frame';
import { ScheduleSelect, type ScheduleSelectOption } from './settings-schedule-fields';
import {
  buildCron,
  defaultOnceAt,
  parseCron,
  toLocalInput,
  weekdayLabels,
  type RepeatPreset,
  type ScheduleKind,
} from './settings-schedule-time';
import { SettingsChoice, SettingsRow } from './settings-row';

const repeatOptions: ScheduleSelectOption[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Every week' },
  { value: 'advanced', label: 'Advanced schedule' },
];

const dayOptions: ScheduleSelectOption[] = weekdayLabels.map(([value, label]) => ({
  value,
  label,
}));

// The date-time field brings its own label; the row's label names it instead.
const fieldWithoutLabel = 'w-full [&_[data-slot=date-time-field]>label]:sr-only';

function initialForm(schedule: ScheduledTurn | undefined, sessionId: string) {
  const parsed = parseCron(schedule?.recurring ? schedule.cron : '');
  const runAt = schedule && !schedule.recurring ? new Date(schedule.run_at) : undefined;
  return {
    sessionId: schedule?.session_id ?? sessionId,
    question: schedule?.question ?? '',
    kind: (schedule ? (schedule.recurring ? 'repeating' : 'once') : 'once') as ScheduleKind,
    onceAt: runAt && !Number.isNaN(runAt.getTime()) ? toLocalInput(runAt) : defaultOnceAt(),
    preset: (schedule?.recurring ? parsed.preset : 'weekdays') as RepeatPreset,
    repeatTime: schedule?.recurring ? parsed.time : '09:00',
    weekday: parsed.weekday,
    customCron: schedule?.recurring && parsed.preset === 'advanced' ? schedule.cron : '',
  };
}

/** New or edit scheduled work: the shared dialog with one field per row. */
export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  sessions,
  sessionId: defaultSessionId,
  serviceTimezone,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The schedule being edited; a new one when absent. */
  schedule?: ScheduledTurn;
  sessions: ScheduleSelectOption[];
  sessionId: string;
  /** The service's time zone for repeating work; absent while it loads. */
  serviceTimezone?: string;
  pending: boolean;
  onSubmit: (sessionId: string, input: CreateScheduledTurnInput) => void;
}) {
  const [form, setForm] = useState(() => initialForm(schedule, defaultSessionId));
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { sessionId, question, kind, onceAt, preset, repeatTime, weekday, customCron } = form;
  const cron = buildCron(preset, repeatTime, weekday, customCron);
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const onceDate = new Date(onceAt);
  const validOnce =
    !Number.isNaN(onceDate.getTime()) &&
    onceDate.getTime() > now &&
    toLocalInput(onceDate) === onceAt;
  const timeCaption = /^\d{2}:\d{2}$/u.test(repeatTime) ? repeatTime : '';
  const repeatCaption =
    preset === 'daily'
      ? 'Every day'
      : preset === 'weekdays'
        ? 'Every weekday'
        : `Every ${weekdayLabels.find(([value]) => value === weekday)?.[1]}`;
  const canSubmit =
    Boolean(sessionId && question.trim()) &&
    (kind === 'once'
      ? validOnce
      : Boolean(cron && serviceTimezone && (preset === 'advanced' || timeCaption)));
  const kept = schedule
    ? {
        overlap_policy: schedule.overlap_policy === 'skip' ? ('skip' as const) : ('queue' as const),
        ...(schedule.max_fires && schedule.recurring ? { max_fires: schedule.max_fires } : {}),
        ...(schedule.until ? { until: schedule.until } : {}),
      }
    : { overlap_policy: 'queue' as const };
  const submit = () => {
    if (!canSubmit || pending) return;
    onSubmit(
      sessionId,
      kind === 'once'
        ? {
            question: question.trim(),
            run_at: new Date(onceAt).toISOString(),
            recurring: false,
            ...kept,
          }
        : {
            question: question.trim(),
            cron,
            recurring: true,
            timezone: serviceTimezone,
            ...kept,
          },
    );
  };

  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Saving…' : schedule ? 'Save changes' : 'Schedule work',
        onConfirm: submit,
        disabled: !canSubmit || pending,
      }}
      description="The service runs it on time, even while this app is closed."
      icon={<ScheduleIcon className="size-4" />}
      onOpenChange={onOpenChange}
      open={open}
      title={schedule ? 'Edit scheduled work' : 'New scheduled work'}
    >
      <div className="@container grid min-w-0" data-slot="schedule-form">
        <SettingsRow
          info="What the session is asked to do when the time comes."
          htmlFor="schedule-instruction"
          title="Instruction"
        >
          <Textarea
            className="min-h-[1.875rem] resize-none px-2.5 py-1.5 text-[0.78125rem] whitespace-normal md:text-[0.78125rem]"
            data-initial-focus=""
            id="schedule-instruction"
            onChange={(event) => update({ question: event.target.value })}
            placeholder="Review new campaign results and summarize material changes."
            rows={2}
            value={question}
          />
        </SettingsRow>
        <SettingsRow
          info="It runs in this session with the session's agent, model, context and access rules."
          htmlFor="schedule-session"
          title="Session"
        >
          <ScheduleSelect
            id="schedule-session"
            onChange={(value) => update({ sessionId: value })}
            options={sessions}
            placeholder="Choose a session"
            value={sessionId}
          />
        </SettingsRow>
        <SettingsRow title="Runs">
          <SettingsChoice
            id="schedule-kind"
            label="Runs"
            onChange={(value) => update({ kind: value as ScheduleKind })}
            options={[
              {
                value: 'once',
                label: 'Once',
                description: 'Continue at a specific date and time.',
              },
              {
                value: 'repeating',
                label: 'Repeats',
                description: 'Continue on a daily or weekly rhythm.',
              },
            ]}
            value={kind}
          />
        </SettingsRow>
        {kind === 'once' ? (
          <SettingsRow
            error={
              validOnce
                ? undefined
                : `Choose a future date and time that exists in ${deviceTimezone}.`
            }
            htmlFor="schedule-once-at"
            title="Date and time"
          >
            <div className={fieldWithoutLabel}>
              <DateTimeField
                compact
                id="schedule-once-at"
                label="Date and time"
                onChange={(value) => update({ onceAt: value })}
                value={onceAt}
              />
            </div>
          </SettingsRow>
        ) : (
          <>
            <SettingsRow
              htmlFor="schedule-repeat"
              note={
                serviceTimezone && timeCaption && preset !== 'advanced'
                  ? `${repeatCaption} at ${timeCaption}`
                  : undefined
              }
              title="Repeat"
            >
              <ScheduleSelect
                id="schedule-repeat"
                onChange={(value) => update({ preset: value as RepeatPreset })}
                options={repeatOptions}
                value={preset}
              />
            </SettingsRow>
            {preset === 'weekly' ? (
              <SettingsRow htmlFor="schedule-weekday" title="Day">
                <ScheduleSelect
                  id="schedule-weekday"
                  onChange={(value) => update({ weekday: value })}
                  options={dayOptions}
                  value={weekday}
                />
              </SettingsRow>
            ) : null}
            {preset === 'advanced' ? (
              <SettingsRow
                info="A five-part schedule expression: minute, hour, day of month, month and day of week. Use it only when the presets do not describe the timing you need."
                htmlFor="schedule-expression"
                title="Expression"
              >
                <Input
                  className="h-[1.875rem] font-mono text-[0.78125rem] md:text-[0.78125rem]"
                  id="schedule-expression"
                  onChange={(event) => update({ customCron: event.target.value })}
                  placeholder="0 9 * * 1-5"
                  value={customCron}
                />
              </SettingsRow>
            ) : (
              <SettingsRow htmlFor="schedule-repeat-time" title="Time">
                <div className={fieldWithoutLabel}>
                  <DateTimeField
                    enableDate={false}
                    id="schedule-repeat-time"
                    label="Time"
                    onChange={(value) => update({ repeatTime: value })}
                    value={repeatTime}
                  />
                </div>
              </SettingsRow>
            )}
          </>
        )}
        <SettingsRow
          info={
            kind === 'once'
              ? 'A one-time run uses the time zone of this device.'
              : 'Repeating work follows the time zone of the connected service.'
          }
          title="Time zone"
        >
          <span className="min-w-0 truncate text-[0.78125rem] text-muted-foreground">
            {kind === 'once' ? deviceTimezone : (serviceTimezone ?? 'Loading…')}
          </span>
        </SettingsRow>
      </div>
    </DialogFrame>
  );
}
