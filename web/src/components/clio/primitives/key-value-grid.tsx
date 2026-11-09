import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { memo, type ComponentProps, type ReactNode } from 'react';
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
  /**
   * `facts` only: in a narrow container, a shorter value to show instead, or
   * `false` to drop the row (its content then lives behind the card's details).
   */
  narrow?: ReactNode | false;
  /** `facts` only: wrap onto more lines instead of an ellipsis (a path being approved). */
  wrap?: boolean;
}

/**
 * Details as label-left, value-right rows on one shared grid, so every label
 * and value starts at the same x. Each value stays on one line and ends in
 * an ellipsis; the action slot keeps its width whether or not a row has one.
 *
 * `facts` is the ask card's form: a fixed 110px label column, 24px rows and
 * left-aligned values. In a narrow container the labels give way to their icons,
 * and a row may swap in its `narrow` value or drop out.
 *
 * `rows` is the settings-sheet form (workbench-right-pocket: Agent): a 118 px
 * label, a left-aligned value, a separator under each row, and a row that
 * highlights when its value is a `KeyValueRowButton`.
 */
export const KeyValueGrid = memo(function KeyValueGrid({
  items,
  actionColumn = false,
  className,
  variant = 'compact',
  'aria-label': ariaLabel,
}: {
  items: readonly KeyValueItem[];
  /** Keep the action column when no row has an action, to line up with sibling rows. */
  actionColumn?: boolean;
  className?: string;
  variant?: 'compact' | 'rows' | 'facts';
  'aria-label'?: string;
}) {
  const hasAction = actionColumn || items.some((item) => item.action);
  const facts = variant === 'facts';
  if (variant === 'rows') {
    return (
      <dl
        aria-label={ariaLabel}
        data-slot="key-value-grid"
        data-variant="rows"
        className={cn('grid min-w-0 text-[12px]', className)}
      >
        {items.map((item) => (
          <div
            className={cn(
              'relative grid min-h-8 min-w-0 items-center gap-x-2.5 border-b border-border px-3.5 py-[7px] has-[[data-slot=key-value-row-button]:enabled]:hover:bg-hover has-[[data-slot=key-value-row-button]:focus-visible]:bg-hover',
              hasAction
                ? 'grid-cols-[118px_minmax(0,1fr)_auto]'
                : 'grid-cols-[118px_minmax(0,1fr)]',
            )}
            data-slot="key-value-row"
            key={item.label}
          >
            <dt className="truncate whitespace-nowrap text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'flex min-w-0 items-center gap-[7px] truncate whitespace-nowrap text-left text-foreground',
                item.mono && 'font-mono text-[11px] tabular-nums',
              )}
              title={item.title ?? (typeof item.value === 'string' ? item.value : undefined)}
            >
              {item.value}
            </dd>
            {hasAction ? <dd className="relative z-10 flex justify-end">{item.action}</dd> : null}
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl
      aria-label={ariaLabel}
      data-slot="key-value-grid"
      data-variant={variant}
      className={cn(
        facts
          ? 'grid auto-rows-[minmax(24px,auto)] items-center gap-x-2.5 text-[12.5px]'
          : 'grid items-center gap-x-3 gap-y-1 text-[12px]',
        facts
          ? hasAction
            ? 'grid-cols-[110px_minmax(0,1fr)_auto] @max-[420px]:grid-cols-[16px_minmax(0,1fr)_auto]'
            : 'grid-cols-[110px_minmax(0,1fr)] @max-[420px]:grid-cols-[16px_minmax(0,1fr)]'
          : hasAction
            ? 'grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,auto)_minmax(0,1fr)]',
        className,
      )}
    >
      {items.map((item) => {
        const dropNarrow = facts && item.narrow === false;
        const narrowValue = facts && item.narrow ? item.narrow : null;
        const wrap = facts && item.wrap;
        const wideValue =
          facts && typeof item.value === 'string' ? (
            <span className={wrap ? 'min-w-0' : 'min-w-0 truncate'}>{item.value}</span>
          ) : (
            item.value
          );
        return (
          <div className="contents" data-narrow={dropNarrow ? 'drop' : undefined} key={item.label}>
            <dt
              className={cn(
                'flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground',
                facts && 'text-[12px]',
                wrap && 'h-6 self-start',
                dropNarrow && '@max-[420px]:hidden',
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
                wrap
                  ? 'min-w-0 py-[3px] leading-[18px] [overflow-wrap:anywhere]'
                  : 'min-w-0 truncate whitespace-nowrap',
                facts
                  ? 'flex items-center gap-[7px] text-left text-foreground/90'
                  : 'text-right text-foreground/85',
                item.mono && 'font-mono text-[11.5px] tabular-nums',
                facts && item.mono && 'text-[12px]',
                dropNarrow && '@max-[420px]:hidden',
              )}
              title={item.title ?? (typeof item.value === 'string' ? item.value : undefined)}
            >
              {narrowValue ? (
                <>
                  <span className="contents @max-[420px]:hidden">{wideValue}</span>
                  <span className="hidden @max-[420px]:contents" data-slot="key-value-narrow">
                    {narrowValue}
                  </span>
                </>
              ) : (
                wideValue
              )}
            </dd>
            {hasAction ? (
              <dd className={cn('flex justify-end', dropNarrow && '@max-[420px]:hidden')}>
                {item.action}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
});

/**
 * A `rows` value that opens something: the whole row is its target, the
 * value stays on one line, and a trailing chevron says whether it opens a
 * choice (`down`) or a view (`right`). A value changed from its baseline is
 * teal and says so in words.
 */
export function KeyValueRowButton({
  chevron,
  changed = false,
  changedLabel = 'changed',
  icon,
  children,
  className,
  ...props
}: ComponentProps<'button'> & {
  chevron: 'down' | 'right';
  changed?: boolean;
  /** Read after the value when `changed`, e.g. "changed for this conversation". */
  changedLabel?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const Chevron = chevron === 'down' ? ChevronDownIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      data-slot="key-value-row-button"
      data-changed={changed || undefined}
      className={cn(
        'flex w-full min-w-0 items-center gap-[7px] text-left outline-none after:absolute after:inset-0 disabled:cursor-default',
        changed ? 'text-changed' : 'text-foreground',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="flex size-3.5 shrink-0 items-center [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        {children}
        {changed ? <span className="sr-only">, {changedLabel}</span> : null}
      </span>
      <Chevron aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-faint" />
    </button>
  );
}
