import { memo, type ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  /** Catalog id of the key that picks this option. */
  shortcut?: string;
  disabled?: boolean;
  /** A small count after the label (Under review 4). Part of the name. */
  badge?: ReactNode;
}

export interface SegmentedControlProps<Value extends string> {
  /** Names the choice for assistive technology ("View"). */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  /** Icons only, each with its name on hover (the frame bar's mode toggle). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Peer modes of one thing (Render / Source / Lineage). Exactly one is always
 * on; clicking the current one keeps it. Navigation between places uses tabs.
 */
function SegmentedControlImpl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  iconOnly = false,
  className,
}: SegmentedControlProps<Value>) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      spacing={0}
      onValueChange={(next) => {
        if (next) onValueChange(next as Value);
      }}
      data-slot="segmented-control"
      className={cn('h-7 shrink-0 gap-px rounded-[7px] bg-muted p-[2px]', className)}
    >
      {options.map((option) => {
        const item = (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={iconOnly ? option.label : undefined}
            disabled={option.disabled}
            className={cn(
              'h-6 min-w-0 gap-1.5 rounded-[5px]! border-0 px-2.5 text-[12px] font-normal whitespace-nowrap text-muted-foreground shadow-none hover:bg-hover hover:text-foreground focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset data-[state=on]:bg-menu-highlight data-[state=on]:text-foreground [&_svg:not([class*=size-])]:size-3.5',
              iconOnly && 'w-[27px] px-0',
            )}
          >
            {option.icon}
            {iconOnly ? null : <span className="truncate">{option.label}</span>}
            {iconOnly ? null : option.badge}
          </ToggleGroupItem>
        );
        return iconOnly ? (
          <NamedTooltip key={option.value} label={option.label} shortcut={option.shortcut}>
            {item}
          </NamedTooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup>
  );
}

export const SegmentedControl = memo(SegmentedControlImpl) as typeof SegmentedControlImpl;
