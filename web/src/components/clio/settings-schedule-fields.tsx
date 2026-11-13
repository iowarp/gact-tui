import type { ScheduledTurn } from '@clio/core/v3';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SettingsSelectField } from './model-select-field';
import { everyWeekday, formatDateTime, parseCron } from './settings-schedule-time';
import { t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** How a row says when it runs: "Weekdays 09:00", "One time 14 Nov 16:00". */
export function ScheduleWords({ schedule }: { schedule: ScheduledTurn }) {
  if (!schedule.recurring) {
    return (
      <>
        {t`One time`}
        <MetaGap />
        {formatDateTime(schedule.run_at || schedule.next_fire_at, schedule.timezone, true)}
      </>
    );
  }
  const parsed = parseCron(schedule.cron);
  if (parsed.preset === 'weekdays') return t`Weekdays ${ph({ time: parsed.time })}`;
  if (parsed.preset === 'daily') return t`Every day ${ph({ time: parsed.time })}`;
  if (parsed.preset === 'weekly') {
    return t`${ph({ repeat: everyWeekday(parsed.weekday) })} ${ph({ time: parsed.time })}`;
  }
  return (
    <>
      <Trans>
        Custom repeat <span className="font-mono text-label">{schedule.cron}</span>
      </Trans>
    </>
  );
}

/** The 14 px gap between meta facts; read as a comma. */
export function MetaGap() {
  return (
    <span className="inline-block w-3.5" data-truncation-text=", ">
      <span className="sr-only">, </span>
    </span>
  );
}

export interface ScheduleSelectOption {
  value: string;
  label: string;
  /** A muted fact at the right of the option (the workspace of a session). */
  hint?: string;
}

/** A settings select: the shared field button opening a radio menu. */
export function ScheduleSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  icon,
  className,
  disabled,
}: {
  id?: string;
  /** Accessible name when no visible label points at the field. */
  label?: string;
  value: string;
  options: ScheduleSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const current = options.find((option) => option.value === value);
  const shown = current ? (current.hint ? `${current.label}, ${current.hint}` : current.label) : '';
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <SettingsSelectField
          aria-label={label ? (shown ? `${label}: ${shown}` : label) : undefined}
          className={className}
          icon={icon}
          id={id}
          placeholder={placeholder}
          title={shown || undefined}
          value={current?.label}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-[min(30rem,var(--radix-dropdown-menu-content-available-width))] min-w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              textValue={option.label}
              value={option.value}
              title={option.hint ? `${option.label}, ${option.hint}` : option.label}
            >
              <span className={cn('min-w-0 truncate', option.hint && 'flex-1')}>
                {option.label}
              </span>
              {option.hint ? (
                // The title keeps priority; the workspace hint truncates first.
                <span className="max-w-32 min-w-10 shrink-[999] truncate text-xs text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
