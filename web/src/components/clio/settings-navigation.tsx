import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useRef, useState } from 'react';
import type { ApplicationDestination } from '@/lib/application-destinations';
import { hostSection, matchingSettingsSections } from '@/lib/settings-window-route';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const SCOPE_ORDER = ['App', 'Workspace', 'Agent'];

function grouped(sections: SettingsDestination[], filter = '') {
  const matched = filter.trim() ? matchingSettingsSections(sections, filter) : undefined;
  const listed = sections.filter((item) => !item.host && (!matched || matched.has(item.id)));
  const groups = [...new Set(listed.map((item) => item.group ?? 'App'))].sort(
    (a, b) => SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b),
  );
  return groups.map((group) => ({
    group,
    items: listed.filter((item) => (item.group ?? 'App') === group),
  }));
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
  const groups = grouped(sections, filter);
  const search = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
  return (
    <div className="flex flex-col gap-3 py-1">
      {search ? (
        <SettingsFilterBar
          count={groups.reduce((sum, group) => sum + group.items.length, 0)}
          filter={filter.trim()}
          onClear={onClearFilter}
        />
      ) : null}
      {groups.map(({ group, items }) => (
        <section key={group} aria-label={scopeLabels[group] ?? group} className="space-y-px">
          <h2
            className="truncate px-2 pb-1 text-[0.6875rem] font-medium text-muted-foreground"
            title={scopeLabels[group] ?? group}
          >
            {scopeLabels[group] ?? group}
          </h2>
          {items.map(({ id, label, icon: Icon }) => (
            <Link
              aria-current={id === current ? 'page' : undefined}
              className={cn(
                'flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-[0.8125rem] whitespace-nowrap outline-none',
                'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                id === current && 'bg-accent font-medium text-accent-foreground',
              )}
              key={id}
              state={linkState}
              title={label}
              to={`/settings/${id}${search}`}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
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
    <Button
      aria-label="Search everywhere"
      className="h-7 w-44 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground max-[599px]:w-7 max-[599px]:justify-center max-[599px]:px-0"
      onClick={openGlobalSearch}
      title="Search settings and everything else"
      type="button"
      variant="outline"
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="max-[599px]:hidden">Search</span>
      <ShortcutKeys id="search" className="ml-auto text-[10px] text-inherit max-[599px]:hidden" />
    </Button>
  );
}

/** Below 768 px the section list folds into this menu in the title row. */
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
  const search = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
  const openingSearch = useRef(false);
  const current = hostSection(sections, section);
  const active = sections.find((item) => item.id === current);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Choose settings section"
          className="h-7 min-w-0 max-w-44 shrink gap-1 px-2 text-xs min-[768px]:hidden"
          variant="outline"
        >
          <span className="truncate">{active?.label ?? 'Sections'}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70dvh] w-72 overflow-y-auto"
        onCloseAutoFocus={(event) => {
          if (!openingSearch.current) return;
          event.preventDefault();
          openingSearch.current = false;
          // Radix removes the old focus scope after this callback returns.
          queueMicrotask(openGlobalSearch);
        }}
      >
        <DropdownMenuItem
          aria-label="Search everywhere from settings menu"
          onSelect={() => {
            openingSearch.current = true;
          }}
        >
          <SearchIcon aria-hidden="true" />
          Search everywhere
          <ShortcutKeys id="search" className="ml-auto text-[10px]" />
        </DropdownMenuItem>
        {search && onClearFilter ? (
          <DropdownMenuItem onSelect={onClearFilter}>
            <CloseIcon aria-hidden="true" />
            <span className="truncate">Show every section</span>
          </DropdownMenuItem>
        ) : null}
        {grouped(sections, filter).map(({ group, items }) => (
          <div key={group}>
            <DropdownMenuLabel className="truncate">
              {scopeLabels[group] ?? group}
            </DropdownMenuLabel>
            {items.map(({ id, label, icon: Icon }) => (
              <DropdownMenuItem asChild key={id}>
                <Link
                  aria-current={id === current ? 'page' : undefined}
                  state={linkState}
                  to={`/settings/${id}${search}`}
                >
                  <Icon aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  <NavBadge badge={badges[id]} />
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

function NavBadge({ badge }: { badge?: { count: number; label: string } }) {
  if (!badge?.count) return null;
  return (
    <Badge
      aria-label={badge.label}
      className="ml-auto h-4.5 min-w-4.5 px-1 text-[10px] tabular-nums"
    >
      {badge.count}
    </Badge>
  );
}
