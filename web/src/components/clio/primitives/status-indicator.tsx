import { memo, useState, type ReactElement, type ReactNode } from 'react';
import {
  CheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleStopIcon,
  InfoIcon,
  MinusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';
import { RingSpinner } from './ring-spinner';
import { statusWordClass } from './status-word-tone';

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
   * Both draw a sign, never a dot. `glyph` sizes work in progress to the 14px
   * activity glyphs; `compact` draws a smaller ring for dense lists.
   */
  mark?: 'compact' | 'glyph';
  /** A domain's own 14px glyph for this state (a run's question bubble); replaces the mark. */
  icon?: ReactNode;
  /**
   * The hover name, when it should say more than the label (the whole line it
   * leads); `false` when a parent already shows the line's hover name.
   */
  hoverName?: string | false;
  className?: string;
}

const GLYPH: Partial<Record<StatusTone, ReactNode>> = {
  success: <CheckIcon className="size-3.5 text-primary" />,
  error: <CircleAlertIcon className="size-3.5 text-destructive" />,
  warning: <TriangleAlertIcon className="size-3.5 text-warning" />,
  // A ring around a square, the stop control's own sign; a bare octagon reads as a hollow ring at 14px.
  stopped: <CircleStopIcon className="size-3.5 text-muted-foreground" />,
};

/**
 * A status column always draws a sign, shape as well as color, so it never relies
 * on color alone and is never a dot. The word stays the accessible and hover name.
 */
const COLUMN_GLYPH: Partial<Record<StatusTone, ReactNode>> = {
  ...GLYPH,
  info: <InfoIcon className="size-3.5 text-info" />,
  idle: <CircleDashedIcon className="size-3.5 text-faint" />,
  inactive: <MinusIcon className="size-3.5 text-faint" />,
};

/**
 * A column mark's hover name, in the shared tooltip rather than a native title.
 * Transcripts carry many marks, so the tooltip mounts on the first pointer
 * enter and opens on the next move.
 */
function ColumnMark({ hoverName, children }: { hoverName?: string; children: ReactElement }) {
  const [armed, setArmed] = useState(false);
  if (!hoverName) return children;
  if (!armed)
    return (
      <span className="contents" onPointerEnter={() => setArmed(true)}>
        {children}
      </span>
    );
  return (
    <span className="contents">
      <NamedTooltip label={hoverName} side="top">
        {children}
      </NamedTooltip>
    </span>
  );
}

/**
 * The one status word: a 12px word, muted except for an error or warning, led by
 * its sign when it has one (a check, an alert, a turning ring) and never by a dot,
 * so a state reads the same in every list, menu and panel. Aligns in a fixed column.
 */
export const StatusIndicator = memo(function StatusIndicator({
  tone,
  label,
  display = 'visible',
  mark: markStyle = 'compact',
  icon,
  hoverName,
  className,
}: StatusIndicatorProps) {
  const glyph = icon ?? (markStyle === 'glyph' ? GLYPH[tone] : undefined);
  // Work in progress is the shared teal ring; a wait on the person is the amber ring.
  const mark =
    icon ??
    COLUMN_GLYPH[tone] ??
    (tone === 'running' ? (
      <RingSpinner className={markStyle === 'glyph' ? undefined : 'size-[11px]'} />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          'block rounded-full border-[1.5px] border-warning border-t-transparent motion-safe:animate-spin motion-safe:will-change-transform',
          markStyle === 'glyph' ? 'size-3' : 'size-[11px]',
        )}
      />
    ));
  if (display === 'column') {
    return (
      <ColumnMark hoverName={hoverName === false ? undefined : (hoverName ?? label)}>
        <span
          role="img"
          aria-label={label}
          data-slot="status-indicator"
          data-tone={tone}
          className={cn('inline-grid size-4 shrink-0 place-items-center', className)}
        >
          {mark}
        </span>
      </ColumnMark>
    );
  }
  // Beside its word a state never leads with a dot: an outcome with a sign shows the sign,
  // work in progress its ring, and any other state is its word alone.
  const wordMark = glyph ?? (tone === 'running' ? mark : GLYPH[tone]);
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-meta whitespace-nowrap text-muted-foreground',
        statusWordClass(tone),
        className,
      )}
    >
      {wordMark ? (
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          {wordMark}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
});
