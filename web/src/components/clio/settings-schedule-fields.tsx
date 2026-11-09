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
import { formatDateTime, parseCron, weekdayLabels } from './settings-schedule-time';

/** How a row says when it runs: "Weekdays 09:00", "One time 14 Nov 16:00". */
export function ScheduleWords({ schedule }: { schedule: ScheduledTurn }) {
  if (!schedule.recurring) {
    return (
      <>
        One time
        <MetaGap />
        {formatDateTime(schedule.run_at || schedule.next_fire_at, schedule.timezone, true)}
      </>
    );
  }
  const parsed = parseCron(schedule.cron);
  if (parsed.preset === 'weekdays') return `Weekdays ${parsed.time}`;
  if (parsed.preset === 'daily') return `Every day ${parsed.time}`;
  if (parsed.preset === 'weekly') {
    const day = weekdayLabels.find(([value]) => value === parsed.weekday)?.[1] ?? 'week';
    return `Every ${day} ${parsed.time}`;
  }
  return (
    <>
      Custom repeat <span className="font-mono text-[0.71875rem]">{schedule.cron}</span>
    </>
  );
}

/** The 14 px gap between meta facts; read as a comma. */
export function MetaGap() {
  return (
    <>
      <span aria-hidden="true" className="inline-block w-3.5" />
      <span className="sr-only">, </span>
    </>
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
        className="max-w-80 min-w-(--radix-dropdown-menu-trigger-width)"
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
                <span className="max-w-32 shrink-0 truncate text-xs text-faint">{option.hint}</span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
