import { memo, type ReactNode } from 'react';
import { CheckIcon, CircleAlertIcon, OctagonIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RingSpinner } from './ring-spinner';

export type StatusTone =
  | 'running'
  | 'waiting'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'idle'
  | 'inactive'
  | 'stopped';

/**
 * Shape as well as color, so the mark never relies on color alone: a turning
 * ring for work in progress, a hollow ring for idle, a square for stopped, a
 * dot for an outcome, a faint dot for something switched off. A label always
 * goes with it.
 */
const MARK: Record<Exclude<StatusTone, 'running'>, string> = {
  waiting: 'size-1.5 rounded-full bg-action ring-2 ring-action/25',
  success: 'size-1.5 rounded-full bg-success',
  warning: 'size-1.5 rounded-full bg-warning',
  error: 'size-1.5 rounded-full bg-destructive',
  info: 'size-1.5 rounded-full bg-info',
  idle: 'size-1.5 rounded-full border border-faint',
  inactive: 'size-1.5 rounded-full bg-faint',
  stopped: 'size-1.5 rounded-[1px] bg-muted-foreground',
};

export interface StatusIndicatorProps {
  tone: StatusTone;
  /** What the state is, in words ("Running", "Needs you"). Always required. */
  label: string;
  /**
   * `visible` shows the label beside the mark. `column` shows only the mark in
   * a fixed 16px status column; the label becomes its accessible name and
   * hover name, and the row must also say the state (a badge or the elapsed
   * time) so it is never color alone.
   */
  display?: 'visible' | 'column';
  /**
   * `glyph` draws an outcome as an icon (a check, an alert, a stop sign), as
   * activity rows do; work in progress is the same spinner either way.
   */
  mark?: 'dot' | 'glyph';
  className?: string;
}

const GLYPH: Partial<Record<StatusTone, ReactNode>> = {
  success: <CheckIcon className="size-3.5 text-primary" />,
  error: <CircleAlertIcon className="size-3.5 text-destructive" />,
  warning: <TriangleAlertIcon className="size-3.5 text-warning" />,
  stopped: <OctagonIcon className="size-3.5 text-warning" />,
};

/**
 * The one status word: a mark carrying the colour and a 12px muted word, so a
 * state reads the same in every list, menu and panel. Aligns in a fixed column.
 */
export const StatusIndicator = memo(function StatusIndicator({
  tone,
  label,
  display = 'visible',
  mark: markStyle = 'dot',
  className,
}: StatusIndicatorProps) {
  const glyph = markStyle === 'glyph' ? GLYPH[tone] : undefined;
  // Work in progress is the shared teal ring; in a glyph column, a wait on the person is too.
  const mark =
    glyph ??
    (tone === 'running' || (markStyle === 'glyph' && tone === 'waiting') ? (
      <RingSpinner className={markStyle === 'glyph' ? undefined : 'size-[11px]'} />
    ) : (
      <span aria-hidden="true" className={cn('block', MARK[tone])} />
    ));
  if (display === 'column') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        data-slot="status-indicator"
        data-tone={tone}
        className={cn('inline-grid size-4 shrink-0 place-items-center', className)}
      >
        {mark}
      </span>
    );
  }
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-[12px] whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
        {mark}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
});
