import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TagTone =
  | 'neutral'
  | 'chip'
  | 'on'
  | 'off'
  | 'caution'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

const TONE: Record<TagTone, string> = {
  neutral: 'border-border text-muted-foreground',
  /** The spec `.chip`: a filled, rounded label such as Default. */
  chip: 'rounded-[9px] border-transparent bg-muted text-muted-foreground',
  on: 'border-primary/50 text-accent-foreground',
  off: 'border-destructive/45 text-destructive',
  /** An outlined warning word on a quiet row (Blocked). */
  caution: 'border-warning/45 text-warning',
  info: 'border-info/25 bg-info/15 text-info-foreground',
  success: 'border-success/25 bg-success/15 text-success-foreground',
  warning: 'border-warning/25 bg-warning/15 text-warning-foreground',
  danger: 'border-destructive/25 bg-destructive/15 text-destructive-foreground',
};

export interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  /**
   * `fixed` is 58px wide so a column of tags lines up and never shifts the
   * row; text that does not fit ends in an ellipsis (full text on hover).
   */
  width?: 'fixed' | 'auto';
  title?: string;
  className?: string;
}

/** A short state word in a fixed slot: On, Off, Needs you, 3 new. */
export const Tag = memo(function Tag({
  children,
  tone = 'neutral',
  width = 'fixed',
  title,
  className,
}: TagProps) {
  return (
    <span
      data-slot="tag"
      data-tone={tone}
      title={title ?? (typeof children === 'string' ? children : undefined)}
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border px-1.5 text-[10.5px] leading-none font-medium whitespace-nowrap',
        width === 'fixed' ? 'w-[58px]' : 'w-fit',
        TONE[tone],
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
});

/** A right-aligned number in a fixed mono column: elapsed time, size, count. */
export const MetaValue = memo(function MetaValue({
  children,
  width = 44,
  className,
}: {
  children: ReactNode;
  /** Column width in px; every row of a list uses the same value. */
  width?: 44 | 52 | 64;
  className?: string;
}) {
  return (
    <span
      data-slot="meta-value"
      className={cn(
        'shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground tabular-nums',
        width === 44 ? 'w-11' : width === 52 ? 'w-[52px]' : 'w-16',
        className,
      )}
    >
      {children}
    </span>
  );
});
