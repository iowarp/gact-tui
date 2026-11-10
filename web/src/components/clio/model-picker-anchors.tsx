import { ChevronDownIcon, LayersIcon, ListFilterIcon, UsersIcon } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FacetChip, FacetTab, FacetTabId } from '@/lib/model-facets';
import { cn } from '@/lib/utils';
import { ChipIcon, FilterCheck } from './model-picker-facet-panel';

type Anchor = {
  tab: FacetTabId;
  label: string;
  noun: string;
  /** The token prefix the facet's choices carry. */
  prefix: string;
  article: 'a' | 'an';
  icon: ComponentType<{ className?: string }>;
  /** Spec `--anw`: each anchor keeps its own fixed width. */
  width: string;
};

const ANCHORS: readonly Anchor[] = [
  {
    tab: 'tasks',
    label: 'Task',
    noun: 'task',
    prefix: 'task:',
    article: 'a',
    icon: ListFilterIcon,
    width: 'basis-[92px]',
  },
  {
    tab: 'providers',
    label: 'Organization',
    noun: 'organization',
    prefix: 'provider:',
    article: 'an',
    icon: UsersIcon,
    width: 'basis-[128px]',
  },
  {
    tab: 'capabilities',
    label: 'Capabilities',
    noun: 'capability',
    prefix: 'cap:',
    article: 'a',
    icon: LayersIcon,
    width: 'basis-[124px]',
  },
];

/**
 * Spec `.c3btns`: Task, Organization and Capabilities as 26px anchors under the
 * search. Each opens its facet's choices; a choice toggles the same token as
 * the Filters panel, so the two always agree. The field's tokens name what is on.
 */
export function ModelPickerAnchors({
  tabs,
  tokens,
  onToggleChip,
  onRemoveToken,
}: {
  tabs: readonly FacetTab[];
  tokens: readonly string[];
  onToggleChip: (chip: FacetChip) => void;
  onRemoveToken: (token: string) => void;
}) {
  return (
    <div
      className="@container/anchors flex min-w-0 items-center gap-1.5"
      data-slot="model-picker-anchors"
    >
      {ANCHORS.map((anchor) => (
        <AnchorFilter
          anchor={anchor}
          key={anchor.tab}
          onRemoveToken={onRemoveToken}
          onToggleChip={onToggleChip}
          tab={tabs.find((tab) => tab.id === anchor.tab)}
          tokens={tokens}
        />
      ))}
    </div>
  );
}

function AnchorFilter({
  anchor,
  tab,
  tokens,
  onToggleChip,
  onRemoveToken,
}: {
  anchor: Anchor;
  tab?: FacetTab;
  tokens: readonly string[];
  onToggleChip: (chip: FacetChip) => void;
  onRemoveToken: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const chips = tab?.groups.flatMap((group) => group.chips) ?? [];
  // A choice stays on while a new Hub search loads, so read it from the tokens, not the page.
  const listed = new Set(chips.map((chip) => chip.token));
  const kept = tokens.filter((token) => token.startsWith(anchor.prefix) && !listed.has(token));
  const on = [
    ...chips.filter((chip) => chip.active).map((chip) => chip.label),
    ...kept.map((token) => tokenLabel(token, anchor.prefix)),
  ];
  const Icon = anchor.icon;
  const empty = chips.length === 0 && kept.length === 0;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={on.length ? `${anchor.label}: ${on.join(', ')}` : anchor.label}
          className={cn(
            'inline-flex h-[26px] min-w-0 shrink items-center gap-1.5 overflow-hidden rounded-[6px] border border-border px-2 text-[12px] font-normal whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 @max-[340px]/anchors:[&>svg:first-child]:hidden',
            anchor.width,
            on.length && 'border-ring/60 bg-accent text-accent-foreground hover:bg-accent',
          )}
          title={on.length ? on.join(', ') : undefined}
          type="button"
        >
          <Icon aria-hidden="true" className="size-[13px] shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{anchor.label}</span>
          <ChevronDownIcon aria-hidden="true" className="ml-auto size-[11px] shrink-0 text-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <Command className="h-auto min-h-0">
          {chips.length > 8 ? (
            <CommandInput placeholder={`Find ${anchor.article} ${anchor.noun}…`} />
          ) : null}
          <CommandList className="max-h-[min(18rem,40dvh)] min-h-0 overscroll-contain">
            <CommandEmpty className="px-3 py-4 text-[12.5px] text-muted-foreground">
              {empty
                ? `No ${anchor.noun} choices in these results.`
                : `No matching ${anchor.noun}.`}
            </CommandEmpty>
            {kept.map((token) => (
              <CommandItem
                className="h-[30px] gap-[9px] text-[12.5px]"
                key={token}
                onSelect={() => onRemoveToken(token)}
                value={token}
              >
                <FilterCheck checked />
                <span className="min-w-0 flex-1 truncate">{tokenLabel(token, anchor.prefix)}</span>
              </CommandItem>
            ))}
            {chips.map((chip) => {
              const blocked = !chip.remote && !chip.active && chip.count === 0;
              return (
                <CommandItem
                  className="h-[30px] gap-[9px] text-[12.5px]"
                  disabled={blocked}
                  key={chip.token}
                  onSelect={() => onToggleChip(chip)}
                  value={`${chip.label} ${chip.token}`}
                >
                  <FilterCheck checked={chip.active} disabled={blocked} />
                  <ChipIcon chip={chip} />
                  <span className="min-w-0 flex-1 truncate">{chip.label}</span>
                  {chip.remote ? null : (
                    <span className="text-[11px] text-faint tabular-nums">{chip.count}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** `task:image-text-to-text` reads as `Image text to text`. */
function tokenLabel(token: string, prefix: string): string {
  const words = token.slice(prefix.length).replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
