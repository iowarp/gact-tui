import { useId, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDaysIcon } from 'lucide-react';
import { DateSelector, type DateSelectorValue } from '@/components/reui/date-selector';
import { TimePicker, TimePickerInput, TimePickerContent } from '@/components/reui/time-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

function preferredHourCycle(): 12 | 24 {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? 12 : 24;
}

function withSeconds(value: string): string {
  return /T\d{2}:\d{2}$/u.test(value) ? `${value}:00` : value;
}

/** Native-compatible wall-time values, with shared date selection and typed time controls. */
export function DateTimeField({
  value,
  onChange,
  label,
  id: suppliedId,
  enableDate = true,
  enableTime = true,
  min,
  max,
  disabled,
  timezone,
  compact = false,
}: {
  /** A short caption ("Nov 10, 09:00") for narrow setting columns; the full date stays on hover. */
  compact?: boolean;
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  enableDate?: boolean;
  enableTime?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  timezone?: string;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [open, setOpen] = useState(false);
  if (!enableDate && !enableTime) return null;
  const parts = value.split('T');
  const day = /^\d{4}-\d{2}-\d{2}$/u.test(parts[0] ?? '') ? parts[0]! : '';
  const time = enableDate ? (parts[1]?.replace(/(?:Z|[+-]\d\d:\d\d)$/u, '') ?? '') : value;
  const parsed = day ? parseISO(day) : undefined;
  const validDay = parsed && !Number.isNaN(parsed.getTime());
  const longDate = validDay
    ? new Intl.DateTimeFormat(formatLocale(), { dateStyle: 'long' }).format(parsed)
    : '';
  const fullCaption = !validDay
    ? t`Choose a date`
    : enableTime && time
      ? t`${longDate} at ${time}`
      : longDate;
  const shortDate =
    compact && validDay
      ? new Intl.DateTimeFormat(
          formatLocale(),
          parsed.getFullYear() === new Date().getFullYear()
            ? { month: 'short', day: 'numeric' }
            : { dateStyle: 'medium' },
        ).format(parsed)
      : '';
  const caption =
    compact && validDay
      ? enableTime && time
        ? t({ message: `${shortDate}, ${time}`, comment: 'Compact date and time' })
        : shortDate
      : fullCaption;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" data-slot="date-time-field">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {enableDate ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              // i18n-ignore: element ids
              aria-labelledby={`${id}-label ${id}-value`}
              className="w-full justify-start font-normal"
              title={compact ? fullCaption : undefined}
            >
              <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0" />
              <span id={`${id}-value`} className="truncate">
                {caption}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] gap-0 overflow-hidden p-0"
            aria-label={t`Choose ${label}`}
          >
            <DateTimePanel
              key={value}
              day={validDay ? parsed : undefined}
              time={time}
              enableTime={enableTime}
              min={min}
              max={max}
              label={label}
              onCancel={() => setOpen(false)}
              onApply={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <TimePicker
          id={id}
          value={value || null}
          onValueChange={(next) => onChange(next ?? '')}
          // i18n-ignore: element ids
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          min={min}
          max={max}
          hourCycle={preferredHourCycle()}
          granularity={/^\d{2}:\d{2}:\d{2}/u.test(value) ? 'second' : 'minute'}
        >
          <TimePickerInput />
          <TimePickerContent align="end" collisionPadding={12} />
        </TimePicker>
      )}
      {timezone ? (
        <p className="text-xs text-muted-foreground">{t`Time zone: ${timezone}`}</p>
      ) : null}
    </div>
  );
}

function DateTimePanel({
  day,
  time,
  enableTime,
  min,
  max,
  label,
  onApply,
  onCancel,
}: {
  day?: Date;
  time: string;
  enableTime: boolean;
  min?: string;
  max?: string;
  label: string;
  onApply: (value: string) => void;
  onCancel: () => void;
}) {
  const timeLabel = useId();
  const [draft, setDraft] = useState<DateSelectorValue | undefined>(
    day ? { period: 'day', operator: 'is', startDate: day } : undefined,
  );
  const [draftTime, setDraftTime] = useState<string | null>(time || (enableTime ? '09:00' : null));
  const selected = draft?.startDate;
  const dateText =
    selected && !Number.isNaN(selected.getTime()) ? format(selected, 'yyyy-MM-dd') : '';
  const next = enableTime ? `${dateText}T${draftTime ?? ''}` : dateText;
  const withinBounds =
    (!min || withSeconds(next) >= withSeconds(min)) &&
    (!max || withSeconds(next) <= withSeconds(max));
  const candidate = new Date(next);
  const localExists =
    !enableTime ||
    (!Number.isNaN(candidate.getTime()) &&
      format(candidate, "yyyy-MM-dd'T'HH:mm:ss") === withSeconds(next));
  const valid = Boolean(dateText && (!enableTime || draftTime) && withinBounds && localExists);
  const year = day?.getFullYear() ?? new Date().getFullYear();
  return (
    <>
      <div className="grid min-h-0 gap-3 overflow-y-auto p-3">
        <DateSelector
          className="w-[min(18rem,calc(100vw-4rem))] sm:w-72"
          value={draft}
          onChange={setDraft}
          periodTypes={['day']}
          presetMode="is"
          allowRange={false}
          showTwoMonths={false}
          label={label}
          inputHint="YYYY-MM-DD"
          dayDateFormat="yyyy-MM-dd"
          dayDateFormats={['yyyy-MM-dd', 'MM/dd/yyyy']}
          minYear={Math.min(1900, year - 10)}
          maxYear={Math.max(new Date().getFullYear() + 20, year + 10)}
        />
        {enableTime ? (
          <div className="grid gap-2">
            <Label id={timeLabel}>{t`Time`}</Label>
            <TimePicker
              value={draftTime}
              onValueChange={setDraftTime}
              aria-labelledby={timeLabel}
              hourCycle={preferredHourCycle()}
              granularity={/^\d{2}:\d{2}:\d{2}/u.test(time) ? 'second' : 'minute'}
            >
              <TimePickerInput />
              <TimePickerContent align="end" collisionPadding={12} />
            </TimePicker>
          </div>
        ) : null}
        {dateText && !withinBounds ? (
          <p role="alert" className="text-xs text-destructive">
            {min && next < min
              ? t`Choose a value on or after ${min.replace('T', ' ')}.`
              : t`Choose a value on or before ${(max ?? '').replace('T', ' ')}.`}
          </p>
        ) : null}
        {dateText && draftTime && !localExists ? (
          <p role="alert" className="text-xs text-destructive">
            {t`This time does not exist in the local time zone. Choose another time.`}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t bg-popover p-3">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button type="button" size="sm" disabled={!valid} onClick={() => onApply(next)}>
          {t`Apply`}
        </Button>
      </div>
    </>
  );
}
