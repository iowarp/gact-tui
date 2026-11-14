import { ChevronDownIcon, LayersIcon, ListFilterIcon, UsersIcon } from 'lucide-react';
import { RemoveIcon } from '@/lib/icon-vocabulary';
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
import { t } from '@lingui/core/macro';

type Anchor = {
  tab: FacetTabId;
  label: string;
  /** Whole messages naming the facet, so each language words them itself. */
  copy: { find: string; loading: string; empty: string; noMatch: string };
  /** The token prefix the facet's choices carry. */
  prefix: string;
  icon: ComponentType<{ className?: string }>;
};

const ANCHORS: readonly Anchor[] = [
  {
    tab: 'tasks',
    label: t`Task`,
    copy: {
      find: t`Find a task…`,
      loading: t`Loading task choices…`,
      empty: t`No task choices in these results.`,
      noMatch: t`No matching task.`,
    },
    prefix: 'task:',
    icon: ListFilterIcon,
  },
  {
    tab: 'providers',
    label: t`Organization`,
    copy: {
      find: t`Find an organization…`,
      loading: t`Loading organization choices…`,
      empty: t`No organization choices in these results.`,
      noMatch: t`No matching organization.`,
    },
    prefix: 'provider:',
    icon: UsersIcon,
  },
  {
    tab: 'capabilities',
    label: t`Capabilities`,
    copy: {
      find: t`Find a capability…`,
      loading: t`Loading capability choices…`,
      empty: t`No capability choices in these results.`,
      noMatch: t`No matching capability.`,
    },
    prefix: 'cap:',
    icon: LayersIcon,
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
            'inline-flex h-[26px] min-w-0 shrink items-center gap-1 overflow-hidden rounded-[6px] border border-border px-1.5 text-meta font-normal whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 @max-[300px]/anchors:[&>svg:first-child]:hidden',
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
          {searchable ? <CommandInput placeholder={anchor.copy.find} /> : null}
          <CommandList className="max-h-[min(18rem,40dvh)] min-h-0 overscroll-contain">
            <CommandEmpty className="px-3 py-4 text-menu text-muted-foreground">
              {empty && searching
                ? anchor.copy.loading
                : empty
                  ? anchor.copy.empty
                  : anchor.copy.noMatch}
            </CommandEmpty>
            {kept.map((token) => (
              <CommandItem
                className="h-[30px] gap-[9px] text-menu"
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
                  className="h-[30px] gap-[9px] text-menu"
                  disabled={blocked}
                  key={chip.token}
                  onSelect={() => onToggleChip(chip)}
                  value={`${chip.label} ${chip.token}`}
                >
                  <FilterCheck checked={chip.active} disabled={blocked} />
                  <ChipIcon chip={chip} />
                  <span className="min-w-0 flex-1 truncate">{chip.label}</span>
                  {chip.remote ? null : (
                    <span className="text-caption text-faint tabular-nums">{chip.count}</span>
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
            className="inline-flex h-5 max-w-[11rem] min-w-[3.5rem] shrink items-center gap-1 rounded-[4px] bg-accent ps-[7px] pe-0.5 text-caption text-accent-foreground"
            data-token={token}
            key={token}
            title={name}
          >
            <span className="min-w-0 truncate">{name}</span>
            <button
              aria-label={t`Remove ${name}`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] text-accent-foreground/60 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onRemoveToken(token)}
              type="button"
            >
              <RemoveIcon aria-hidden="true" className="size-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
