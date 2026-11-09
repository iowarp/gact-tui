import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface KeyValueItem {
  label: string;
  /** A 14px icon before the label. */
  icon?: ReactNode;
  value: ReactNode;
  /** Monospace for addresses, versions and sizes. */
  mono?: boolean;
  /** Full text on hover when the value is cut. */
  title?: string;
  /** One small action at the end of the row (Check again, Edit). */
  action?: ReactNode;
}

/**
 * Details as label-left, value-right rows on one shared grid, so every label
 * and value starts at the same x. Each value stays on one line and ends in
 * an ellipsis; the action slot keeps its width whether or not a row has one.
 *
 * `facts` is the ask card's form: a fixed 96px label column, 24px rows and
 * left-aligned values. In a narrow container the labels give way to their icons.
 */
export const KeyValueGrid = memo(function KeyValueGrid({
  items,
  className,
  variant = 'details',
}: {
  items: readonly KeyValueItem[];
  className?: string;
  variant?: 'details' | 'facts';
}) {
  const hasAction = items.some((item) => item.action);
  const facts = variant === 'facts';
  return (
    <dl
      data-slot="key-value-grid"
      data-variant={variant}
      className={cn(
        facts
          ? 'grid auto-rows-[24px] items-center gap-x-2.5 text-[12.5px]'
          : 'grid items-center gap-x-3 gap-y-1 text-[12px]',
        facts
          ? hasAction
            ? 'grid-cols-[96px_minmax(0,1fr)_auto] @max-[420px]:grid-cols-[16px_minmax(0,1fr)_auto]'
            : 'grid-cols-[96px_minmax(0,1fr)] @max-[420px]:grid-cols-[16px_minmax(0,1fr)]'
          : hasAction
            ? 'grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,auto)_minmax(0,1fr)]',
        className,
      )}
    >
      {items.map((item) => (
        <div className="contents" key={item.label}>
          <dt
            className={cn(
              'flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground',
              facts && 'text-[12px]',
            )}
            title={facts ? item.label : undefined}
          >
            {item.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-3.5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5",
                  facts && 'hidden @max-[420px]:grid',
                )}
              >
                {item.icon}
              </span>
            ) : null}
            <span className={cn('truncate', facts && item.icon && '@max-[420px]:sr-only')}>
              {item.label}
            </span>
          </dt>
          <dd
            className={cn(
              'min-w-0 truncate whitespace-nowrap text-foreground',
              facts ? 'flex items-center gap-[7px] text-left text-foreground/90' : 'text-right',
              item.mono && 'font-mono text-[11px] tabular-nums',
              facts && item.mono && 'text-[12px]',
            )}
            title={item.title ?? (typeof item.value === 'string' ? item.value : undefined)}
          >
            {facts && typeof item.value === 'string' ? (
              <span className="min-w-0 truncate">{item.value}</span>
            ) : (
              item.value
            )}
          </dd>
          {hasAction ? <dd className="flex justify-end">{item.action}</dd> : null}
        </div>
      ))}
    </dl>
  );
});
