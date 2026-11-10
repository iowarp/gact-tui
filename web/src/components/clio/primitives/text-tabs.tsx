import { ChevronDownIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';

export interface TextTab<Value extends string> {
  value: Value;
  label: string;
  /** Shown before the label; it is the whole tab when the strip is compact. */
  icon?: ReactNode;
  /** Results or items behind the tab, right of the label in tabular figures. Zero hides it. */
  count?: number;
  /** A tab that gathers several kinds ("More") carries a chevron after its label. */
  gathers?: boolean;
}

export interface TextTabsProps<Value extends string> {
  /** Names the tab strip ("Result type"). */
  label: string;
  tabs: readonly TextTab<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  /** Icons only, each with its name and count on hover (narrow windows). */
  compact?: boolean;
  /** The panel the tabs control, for `aria-controls`. */
  controls?: string;
  /** Keep focus where it is (a search field) when a tab is pressed. */
  keepFocus?: boolean;
  className?: string;
}

/**
 * Text tabs that move between places or result types (All, Conversations,
 * Files). Each tab is one line; counts never wrap and sit in fixed figures.
 * Peer modes of one thing use `SegmentedControl` instead.
 */
function TextTabsImpl<Value extends string>({
  label,
  tabs,
  value,
  onValueChange,
  compact = false,
  controls,
  keepFocus = false,
  className,
}: TextTabsProps<Value>) {
  return (
    <div
      aria-label={label}
      className={cn(
        'flex h-8 min-w-0 items-stretch gap-3 overflow-hidden whitespace-nowrap',
        className,
      )}
      data-slot="text-tabs"
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        // A count shows only where there are results.
        const count = tab.count === 0 ? undefined : tab.count;
        // A tab without results fades its name until it is pointed at, focused or chosen.
        // "More" gathers other kinds and keeps its tone.
        const empty = tab.count === 0 && !selected && !tab.gathers;
        const name = count === undefined ? tab.label : `${tab.label}, ${count}`;
        // Compact strips draw icons only, but the chosen tab keeps its name.
        const iconOnly = compact && Boolean(tab.icon) && !selected;
        const button = (
          <button
            aria-controls={controls}
            aria-label={compact ? name : undefined}
            aria-selected={selected}
            className={cn(
              'relative inline-flex min-w-0 shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
              'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0',
              empty && 'text-faint focus-visible:text-muted-foreground',
              selected && 'font-medium text-foreground after:opacity-100',
              '[&_svg]:size-3.5 [&_svg]:shrink-0',
            )}
            data-empty={empty || undefined}
            data-state={selected ? 'active' : 'inactive'}
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
            role="tab"
            tabIndex={keepFocus ? -1 : selected ? 0 : -1}
            type="button"
          >
            {tab.icon}
            {iconOnly ? null : <span>{tab.label}</span>}
            {tab.gathers && !iconOnly ? (
              <ChevronDownIcon className="-ml-1 size-3! text-muted-foreground" />
            ) : null}
            {count === undefined ? null : (
              <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
        return compact && tab.icon ? (
          <NamedTooltip key={tab.value} label={name}>
            {button}
          </NamedTooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}

export const TextTabs = memo(TextTabsImpl) as typeof TextTabsImpl;
