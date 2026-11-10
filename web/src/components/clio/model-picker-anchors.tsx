import { ChevronDownIcon, LayersIcon, ListFilterIcon, UsersIcon, XIcon } from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FacetChip, FacetTab, FacetTabId } from '@/lib/model-facets';
import { filterTokenName } from '@/lib/model-filter-token-name';
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
  searching = false,
}: {
  tabs: readonly FacetTab[];
  tokens: readonly string[];
  onToggleChip: (chip: FacetChip) => void;
  onRemoveToken: (token: string) => void;
  searching?: boolean;
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
          searching={searching}
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
  searching,
}: {
  anchor: Anchor;
  tab?: FacetTab;
  tokens: readonly string[];
  onToggleChip: (chip: FacetChip) => void;
  onRemoveToken: (token: string) => void;
  searching: boolean;
}) {
  const [open, setOpen] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);
  const chips = tab?.groups.flatMap((group) => group.chips) ?? [];
  const searchable = chips.length > 8;
  // A choice stays on while a new Hub search loads, so read it from the tokens, not the page.
  const listed = new Set(chips.map((chip) => chip.token));
  const kept = tokens.filter((token) => token.startsWith(anchor.prefix) && !listed.has(token));
  const on = [
    ...chips.filter((chip) => chip.active).map((chip) => chip.label),
    ...kept.map((token) => filterTokenName(token, [])),
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
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        // Without a find field the list itself takes the keys (arrows, Enter).
        onOpenAutoFocus={(event) => {
          if (searchable) return;
          event.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <Command className="h-auto min-h-0 outline-none" ref={commandRef} tabIndex={-1}>
          {searchable ? (
            <CommandInput placeholder={`Find ${anchor.article} ${anchor.noun}…`} />
          ) : null}
          <CommandList className="max-h-[min(18rem,40dvh)] min-h-0 overscroll-contain">
            <CommandEmpty className="px-3 py-4 text-[12.5px] text-muted-foreground">
              {empty && searching
                ? `Loading ${anchor.noun} choices…`
                : empty
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
                <span className="min-w-0 flex-1 truncate">{filterTokenName(token, [])}</span>
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

/** Spec `.c3tok`: a filter that is on, named, inside the search field. */
export function ModelPickerFieldTokens({
  tokens,
  tabs,
  onRemoveToken,
}: {
  tokens: readonly string[];
  tabs: readonly FacetTab[];
  onRemoveToken: (token: string) => void;
}) {
  return (
    <div
      className="flex min-w-0 shrink items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      data-slot="filter-tokens"
    >
      {tokens.map((token) => {
        const name = filterTokenName(token, tabs);
        return (
          <span
            className="inline-flex h-5 max-w-[11rem] min-w-[3.5rem] shrink items-center gap-1 rounded-[4px] bg-accent ps-[7px] pe-0.5 text-[11px] text-accent-foreground"
            data-token={token}
            key={token}
            title={name}
          >
            <span className="min-w-0 truncate">{name}</span>
            <button
              aria-label={`Remove ${name}`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] text-accent-foreground/60 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onRemoveToken(token)}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
