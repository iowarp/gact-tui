import { memo, type ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';

export interface FilterChipOption<Value extends string> {
  value: Value;
  /** The hover and accessible name ("Waiting for you"). */
  label: string;
  icon: ReactNode;
  /** A count after the icon ("3" running); omitted when it is not known exactly. */
  count?: number;
  shortcut?: string;
}

export interface FilterChipsProps<Value extends string> {
  /** Names the filter for assistive technology ("Filter by state"). */
  label: string;
  options: readonly FilterChipOption<Value>[];
  /** The chosen chip, or `none` when the filter is off. */
  value: Value;
  /** The value that means no chip is chosen ("all"). */
  none: Value;
  onValueChange: (value: Value) => void;
  className?: string;
}

/**
 * A list bar's filter pills (spec `.d-ch`): 24px tall, 12px radius, a fixed 46px
 * each so counts never shift the row, icon and count only with the name on hover.
 * At most one is on (accent fill); choosing it again turns the filter off.
 */
function FilterChipsImpl<Value extends string>({
  label,
  options,
  value,
  none,
  onValueChange,
  className,
}: FilterChipsProps<Value>) {
  // The tooltip trigger replaces the item's data-state, so the on look keys off aria-checked.
  return (
    <ToggleGroup
      aria-label={label}
      className={cn('flex shrink-0 items-center gap-1.5', className)}
      data-slot="filter-chips"
      onValueChange={(next) => onValueChange((next || none) as Value)}
      spacing={0}
      type="single"
      value={value === none ? '' : value}
    >
      {options.map((option) => (
        <NamedTooltip key={option.value} label={option.label} shortcut={option.shortcut}>
          <ToggleGroupItem
            aria-label={
              option.count === undefined ? option.label : `${option.label}, ${option.count}`
            }
            className="h-6 w-[46px] min-w-0 shrink-0 justify-center gap-1 rounded-[12px]! border border-border! bg-transparent px-0 text-label font-medium text-muted-foreground shadow-none hover:bg-hover hover:text-foreground focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring aria-checked:border-accent-border! aria-checked:bg-accent aria-checked:text-accent-foreground [&_svg:not([class*=size-])]:size-[13px]"
            value={option.value}
          >
            {option.icon}
            {option.count === undefined ? null : (
              <span aria-hidden="true" className="min-w-[7px] text-center tabular-nums">
                {option.count}
              </span>
            )}
          </ToggleGroupItem>
        </NamedTooltip>
      ))}
    </ToggleGroup>
  );
}

export const FilterChips = memo(FilterChipsImpl) as typeof FilterChipsImpl;
