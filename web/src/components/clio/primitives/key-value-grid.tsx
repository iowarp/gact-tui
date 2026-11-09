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
 */
export const KeyValueGrid = memo(function KeyValueGrid({
  items,
  className,
}: {
  items: readonly KeyValueItem[];
  className?: string;
}) {
  const hasAction = items.some((item) => item.action);
  return (
    <dl
      data-slot="key-value-grid"
      className={cn(
        'grid items-center gap-x-3 gap-y-1 text-[12px]',
        hasAction
          ? 'grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,auto)_minmax(0,1fr)]',
        className,
      )}
    >
      {items.map((item) => (
        <div className="contents" key={item.label}>
          <dt className="flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
            {item.icon ? (
              <span
                aria-hidden="true"
                className="grid size-3.5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5"
              >
                {item.icon}
              </span>
            ) : null}
            <span className="truncate">{item.label}</span>
          </dt>
          <dd
            className={cn(
              'min-w-0 truncate whitespace-nowrap text-right text-foreground',
              item.mono && 'font-mono text-[11px] tabular-nums',
            )}
            title={item.title ?? (typeof item.value === 'string' ? item.value : undefined)}
          >
            {item.value}
          </dd>
          {hasAction ? <dd className="flex justify-end">{item.action}</dd> : null}
        </div>
      ))}
    </dl>
  );
});
