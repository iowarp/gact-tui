import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useRef, useState } from 'react';
import type { ApplicationDestination } from '@/lib/application-destinations';
import { groupedSettingsSections, hostSection } from '@/lib/settings-window-route';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { SettingsScopeIcon } from '@/components/clio/settings-scope-icon';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PickerFooter } from '@/components/clio/primitives/picker-footer';
import { cn } from '@/lib/utils';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { IconButton } from '@/components/clio/primitives/icon-button';

export type SettingsDestination = ApplicationDestination;

export interface SettingsNavigationProps {
  sections: SettingsDestination[];
  section: string;
  /** Route state that keeps the workspace behind the window while moving between sections. */
  linkState: unknown;
  /** Scope headings: App, the workspace's name, the agent connection's label. */
  scopeLabels: Record<string, string>;
  /** Items waiting on a section (e.g. memory changes to review), shown as a count. */
  badges?: Record<string, { count: number; label: string }>;
  /** A search from the global search (`?q=`): only matching sections are listed. */
  filter?: string;
  /** Lists every section again. */
  onClearFilter?: () => void;
}

function openGlobalSearch() {
  window.dispatchEvent(new Event('clio:open-command-menu'));
}

/** The window's section list, grouped by the scope each setting applies to. */
export function SettingsNavigation({
  sections,
  section,
  linkState,
  scopeLabels,
  badges = {},
  filter = '',
  onClearFilter,
}: SettingsNavigationProps) {
  const current = hostSection(sections, section);
  const groups = groupedSettingsSections(sections, filter);
  const search = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
  return (
    <div className="flex flex-col">
      {search ? (
        <SettingsFilterBar
          count={groups.reduce((sum, group) => sum + group.items.length, 0)}
          filter={filter.trim()}
          onClear={onClearFilter}
        />
      ) : null}
      {groups.map(({ group, items }) => (
        <section key={group} aria-label={scopeLabels[group] ?? group}>
          <h2
            className="mt-2 flex h-7 min-w-0 items-center gap-2 px-2 text-xs font-medium text-muted-foreground first:mt-0"
            title={scopeLabels[group] ?? group}
          >
            <SettingsScopeIcon group={group} />
            <span className="min-w-0 truncate">{scopeLabels[group] ?? group}</span>
          </h2>
          {items.map(({ id, label }) => (
            <Link
              aria-current={id === current ? 'page' : undefined}
              className={cn(
                'flex h-[1.625rem] w-full min-w-0 items-center gap-2 rounded-md pr-2 pl-[1.9375rem] text-[0.78125rem] whitespace-nowrap text-foreground/80 outline-none',
                'hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                id === current && 'bg-menu-highlight text-foreground hover:bg-menu-highlight',
              )}
              key={id}
              state={linkState}
              title={label}
              to={`/settings/${id}${search}`}
            >
              <span className="min-w-0 truncate">{label}</span>
              <NavBadge badge={badges[id]} />
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Title-row search: the global search, so a setting result opens on its row. */
export function SettingsSearchButton() {
  return (
    <button
      aria-label="Search everywhere"
      className={cn(
        'flex h-[1.875rem] w-full min-w-0 items-center gap-[0.4375rem] rounded-lg border border-border bg-popover pr-1.5 pl-2.5 text-[0.78125rem] whitespace-nowrap text-muted-foreground/80 outline-none',
        'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
        'max-[599px]:size-7 max-[599px]:justify-center max-[599px]:p-0',
      )}
      onClick={openGlobalSearch}
      title="Search settings and everything else"
      type="button"
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left max-[599px]:hidden">Search</span>
      <ShortcutKeys id="search" variant="inline" className="max-[599px]:hidden" />
    </button>
  );
}

/**
 * Below 600 px the section list folds into this picker in the title's place:
 * the current section's icon and name, opening the one searchable Picker.
 */
export function SettingsSectionPicker({
  sections,
  section,
  linkState,
  scopeLabels,
  badges = {},
  filter = '',
  onClearFilter,
}: SettingsNavigationProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const search = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
  const openingSearch = useRef(false);
  const current = hostSection(sections, section);
  const active = sections.find((item) => item.id === current);
  const ActiveIcon = active?.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Choose settings section"
          className={cn(
            'flex h-7 max-w-52 min-w-0 shrink items-center gap-1.5 rounded-md border border-input px-2 text-[13px] font-medium whitespace-nowrap text-foreground outline-none',
            'hover:bg-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-hover',
          )}
          title={active ? `${active.label}: choose another section` : 'Choose a section'}
          type="button"
        >
          {ActiveIcon ? (
            <ActiveIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="min-w-0 truncate">{active?.label ?? 'Sections'}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(18rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          if (!openingSearch.current) return;
          event.preventDefault();
          openingSearch.current = false;
          // Radix removes the old focus scope after this callback returns.
          queueMicrotask(openGlobalSearch);
        }}
      >
        <Command
          filter={(_value, query, keywords) =>
            (keywords ?? []).join(' ').toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0
          }
          label="Settings sections"
        >
          <CommandInput placeholder="Search sections…" />
          <CommandList className="max-h-[min(70dvh,28rem)]">
            <CommandEmpty>No section matches</CommandEmpty>
            <CommandGroup>
              <CommandItem
                aria-label="Search everywhere from settings menu"
                keywords={['Search everywhere']}
                onSelect={() => {
                  openingSearch.current = true;
                  setOpen(false);
                }}
                value="search-everywhere"
              >
                <SearchIcon aria-hidden="true" className="text-muted-foreground" />
                Search everywhere
                <CommandShortcut>
                  <ShortcutKeys id="search" variant="inline" />
                </CommandShortcut>
              </CommandItem>
              {search && onClearFilter ? (
                <CommandItem
                  keywords={['Show every section']}
                  onSelect={() => {
                    onClearFilter();
                    setOpen(false);
                  }}
                  value="show-every-section"
                >
                  <CloseIcon aria-hidden="true" className="text-muted-foreground" />
                  <span className="truncate">Show every section</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
            {groupedSettingsSections(sections, filter).map(({ group, items }) => (
              <CommandGroup heading={scopeLabels[group] ?? group} key={group}>
                {items.map(({ id, label, icon: Icon }) => (
                  <CommandItem
                    aria-current={id === current ? 'page' : undefined}
                    data-checked={id === current || undefined}
                    key={id}
                    keywords={[label, scopeLabels[group] ?? group]}
                    onSelect={() => {
                      setOpen(false);
                      void navigate(`/settings/${id}${search}`, { state: linkState });
                    }}
                    value={id}
                  >
                    <Icon aria-hidden="true" className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" title={label}>
                      {label}
                    </span>
                    <NavBadge badge={badges[id]} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <PickerFooter
          hints={[
            { label: 'Move', shortcut: 'menu-move', optional: true },
            { label: 'Open', shortcut: 'menu-pick' },
            { label: 'Close', shortcut: 'menu-close', onSelect: () => setOpen(false) },
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Says the list is a search's results, and how to see every section again. */
function SettingsFilterBar({
  filter,
  count,
  onClear,
}: {
  filter: string;
  count: number;
  onClear?: () => void;
}) {
  return (
    <div
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted/60 pr-0.5 pl-2 text-xs whitespace-nowrap"
      role="status"
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate" title={filter}>
        {filter}
      </span>
      <span className="shrink-0 text-muted-foreground tabular-nums">{count}</span>
      {onClear ? (
        <IconButton
          className="ml-auto"
          icon={<CloseIcon />}
          label="Show every section"
          onClick={onClear}
          size="sm"
        />
      ) : null}
    </div>
  );
}

export function NavBadge({ badge }: { badge?: { count: number; label: string } }) {
  if (!badge?.count) return null;
  return (
    <Badge
      aria-label={badge.label}
      className="ml-auto h-4.5 min-w-4.5 shrink-0 rounded-full border-transparent bg-destructive px-1.5 text-[0.65625rem] font-medium text-background tabular-nums"
    >
      {badge.count}
    </Badge>
  );
}
