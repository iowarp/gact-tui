import type { ScheduledTurn } from '@clio/core/v3';
import { Clock3Icon, PauseIcon, PlayIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteIcon, EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { ShortcutKeys } from './primitives/key-chip';
import { StatusIndicator } from './primitives/status-indicator';
import { MetaGap, ScheduleWords } from './settings-schedule-fields';
import { formatDateTime } from './settings-schedule-time';

const STATUS_WIDTH = 158;
const ACTIONS_WIDTH = 104;

function scheduleStatus(schedule: ScheduledTurn) {
  if (!schedule.enabled)
    return { tone: 'stopped' as const, label: 'Paused', detail: schedule.disabled_reason };
  if (schedule.last_error)
    return { tone: 'warning' as const, label: 'Last run failed', detail: schedule.last_error };
  return { tone: 'success' as const, label: 'Scheduled', detail: '' };
}

/** The facts a row has no room for, shown at the top of its ⋯ menu. */
function scheduleDetails(schedule: ScheduledTurn, serviceTimezone: string) {
  const timezone = schedule.timezone || serviceTimezone;
  const next = schedule.next_fire_at || schedule.run_at;
  const lines = [
    `Next run ${next ? `${formatDateTime(next, timezone)}, ${timezone}` : 'not scheduled'}`,
  ];
  if (schedule.fire_count)
    lines.push(
      `Completed ${schedule.fire_count} ${schedule.fire_count === 1 ? 'run' : 'runs'}${
        schedule.last_fired_at ? `, last ${formatDateTime(schedule.last_fired_at, timezone)}` : ''
      }`,
    );
  lines.push(
    schedule.overlap_policy === 'skip'
      ? 'Skips a run while the last is still going'
      : 'Queues a run while the last is still going',
  );
  if (schedule.recurring && schedule.cron) lines.push(`Expression ${schedule.cron}`);
  return lines;
}

/** One scheduled instruction (D): clock, instruction, workspace and timing, status, actions. */
export const ScheduleRow = memo(function ScheduleRow({
  schedule,
  place,
  serviceTimezone,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  schedule: ScheduledTurn;
  /** Where it runs: the session's workspace name. */
  place: string;
  serviceTimezone: string;
  busy: boolean;
  onToggle: (schedule: ScheduledTurn) => void;
  onEdit: (schedule: ScheduledTurn) => void;
  onDelete: (schedule: ScheduledTurn) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);
  const status = scheduleStatus(schedule);
  const keep = () => {
    setConfirming(false);
    rowRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      if (confirming && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        keep();
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onEdit(schedule);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      setConfirming(true);
    } else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      setMenuOpen(true);
    }
  };
  const meta = (
    <>
      {place}
      {place ? <MetaGap /> : null}
      <ScheduleWords schedule={schedule} />
    </>
  );
  const pauseLabel = schedule.enabled ? 'Pause' : 'Resume';
  if (confirming)
    return (
      <ItemRow
        actionsWidth={0}
        aria-label={schedule.question}
        className="bg-destructive/8 hover:bg-destructive/8"
        icon={<Clock3Icon />}
        meta={meta}
        onKeyDown={onKeyDown}
        ref={rowRef}
        role="group"
        slot={
          <>
            <span
              className="min-w-0 truncate text-xs text-faint"
              title="Future runs are removed. Completed work stays in the session history."
            >
              Delete this schedule?
            </span>
            <Button onClick={keep} ref={keepRef} size="sm" variant="ghost">
              Keep schedule
            </Button>
            <Button
              disabled={busy}
              onClick={() => onDelete(schedule)}
              size="sm"
              variant="destructive"
            >
              Delete
            </Button>
          </>
        }
        slotWidth={STATUS_WIDTH + ACTIONS_WIDTH + 20}
        title={<span title={schedule.question}>{schedule.question}</span>}
      />
    );
  return (
    <ItemRow
      actions={
        <>
          <IconButton
            disabled={busy}
            icon={schedule.enabled ? <PauseIcon /> : <PlayIcon />}
            label={pauseLabel}
            onClick={() => onToggle(schedule)}
            size="sm"
          />
          <IconButton icon={<EditIcon />} label="Edit" onClick={() => onEdit(schedule)} size="sm" />
          <IconButton
            icon={<DeleteIcon />}
            label="Delete"
            onClick={() => setConfirming(true)}
            size="sm"
          />
          <DropdownMenu modal={false} onOpenChange={setMenuOpen} open={menuOpen}>
            {/* The tooltip wraps the trigger so the menu's trigger props reach the button. */}
            <NamedTooltip label="More">
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreIcon />} label="More" size="sm" tooltip={false} />
              </DropdownMenuTrigger>
            </NamedTooltip>
            <DropdownMenuContent align="end" className="max-w-80">
              <DropdownMenuLabel className="grid gap-0.5 font-normal">
                {scheduleDetails(schedule, serviceTimezone).map((line) => (
                  <span className="truncate" key={line} title={line}>
                    {line}
                  </span>
                ))}
                {status.detail ? (
                  <span className="truncate" title={status.detail}>
                    {status.detail}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onSelect={() => onToggle(schedule)}>
                {schedule.enabled ? (
                  <PauseIcon aria-hidden="true" />
                ) : (
                  <PlayIcon aria-hidden="true" />
                )}
                {pauseLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(schedule)}>
                <EditIcon aria-hidden="true" />
                Edit
                <DropdownMenuShortcut>
                  <ShortcutKeys keys={['Enter']} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirming(true)}>
                <DeleteIcon aria-hidden="true" />
                Delete
                <DropdownMenuShortcut>
                  <ShortcutKeys keys={['Delete']} mac={['Backspace']} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      actionsVisible={menuOpen}
      actionsWidth={ACTIONS_WIDTH}
      aria-label={schedule.question}
      icon={<Clock3Icon />}
      meta={meta}
      onKeyDown={onKeyDown}
      ref={rowRef}
      role="group"
      status={
        <span className="flex min-w-0" title={status.detail || undefined}>
          <StatusIndicator label={status.label} tone={status.tone} />
        </span>
      }
      statusWidth={STATUS_WIDTH}
      tabIndex={0}
      title={<span title={schedule.question}>{schedule.question}</span>}
    />
  );
});
