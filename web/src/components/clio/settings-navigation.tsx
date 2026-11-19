import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useEffect, useRef, useState } from 'react';
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
import { CloseIcon, SettingsWindowIcon } from '@/lib/icon-vocabulary';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Tag } from '@/components/clio/primitives/tag';
import {
  cappedLabelRoom,
  inputTextRoom,
  useFittingText,
} from '@/components/clio/primitives/use-fitting-text';
import { identifierInputProps } from '@/lib/identifier-input';
import { ph, plural, t } from '@lingui/core/macro';

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
  /** Sections the connected service doesn't offer, dimmed, with the reason on hover. */
  unavailable?: Record<string, string>;
  /**
   * In the filtered window (`?q=`): the matching rows per section. Every section
   * stays listed; the ones without a match dim.
   */
  counts?: Record<string, number>;
  /** Leaves the filtered window. */
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
  unavailable = {},
  counts,
}: SettingsNavigationProps) {
  // The filtered window shows no one section, so none is current.
  const current = counts ? undefined : hostSection(sections, section);
  const groups = groupedSettingsSections(sections);
  return (
    <div className="flex flex-col">
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
                // A long section name (Greek, Japanese) wraps to a second line rather than clipping.
                'flex min-h-[1.625rem] w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-[1.9375rem] text-menu leading-tight text-foreground/80 outline-none',
                'hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                id === current && 'bg-nav-current text-foreground hover:bg-nav-current',
                unavailable[id] && id !== current && 'text-faint/75 hover:text-muted-foreground',
                counts && !counts[id] && 'text-faint hover:text-muted-foreground',
              )}
              key={id}
              replace
              state={linkState}
              title={unavailable[id] ? `${label}: ${unavailable[id]}` : label}
              to={`/settings/${id}`}
            >
              <span className="line-clamp-2 min-w-0 text-pretty break-words">{label}</span>
              {counts ? <ResultCount count={counts[id]} /> : <NavBadge badge={badges[id]} />}
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Title-row search: the global search, so a setting result opens on its row. */
export function SettingsSearchButton({ autoFocus = false }: { autoFocus?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  // After Esc clears the filtered window, the field unmounts and the dialog's
  // focus scope reclaims focus; take it back once that has settled.
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);
  return (
    <button
      aria-label={t`Search everywhere`}
      ref={button}
      className={cn(
        'flex h-[1.875rem] w-full min-w-0 items-center gap-[0.4375rem] rounded-lg border border-border bg-popover pr-1.5 pl-2.5 text-menu whitespace-nowrap text-muted-foreground outline-none',
        'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
      onClick={openGlobalSearch}
      title={t`Search settings and everything else`}
      type="button"
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      {/* Whole or not at all: a word cut to "Αναζήτ…" reads worse than the icon alone. */}
      <span className="flex h-[1lh] min-w-0 flex-1 flex-wrap overflow-hidden">
        <span aria-hidden="true" className="h-full w-0" />
        <span className="shrink-0">{t`Search`}</span>
      </span>
      <ShortcutKeys id="search" variant="caps" capSize="sm" className="max-[599px]:hidden" />
    </button>
  );
}

/**
 * The filtered window's title-row field: the palette's query, editable here.
 * Esc clears it and leaves the filtered window; Esc again closes Settings.
 */
export function SettingsQueryField({
  query,
  count,
  onChange,
  onClear,
}: {
  query: string;
  /** Rows the window shows for the query. */
  count: number;
  onChange: (query: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Typed text stays local: the route catches up a render later, and a lagging
  // value must not overwrite newer keystrokes. A query changed elsewhere wins.
  const [value, setValue] = useState(query);
  const sent = useRef(query);
  useEffect(() => {
    if (query === sent.current) return;
    sent.current = query;
    setValue(query);
  }, [query]);
  // Arriving from Ctrl K, typing carries on here.
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const placeholder = useFittingText(input, [t`Search settings`, t`Search`], inputTextRoom);
  return (
    <div
      className={cn(
        'flex h-[1.875rem] w-full min-w-0 items-center gap-[0.4375rem] rounded-lg border border-border bg-popover pr-1.5 pl-2.5 text-menu whitespace-nowrap',
        'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
      )}
      data-escape-scope
      data-window-search-field
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        {...identifierInputProps}
        aria-label={t`Search settings`}
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint"
        onChange={(event) => {
          sent.current = event.target.value;
          setValue(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onClear();
        }}
        placeholder={placeholder}
        ref={input}
        spellCheck={false}
        type="text"
        value={value}
      />
      <Tag
        className="h-5 gap-1 rounded-[5px] border-transparent bg-accent text-caption font-normal text-accent-foreground max-[599px]:hidden"
        title={t`Searching settings`}
        width="auto"
      >
        <SettingsWindowIcon aria-hidden="true" className="mr-1 inline size-3 align-[-0.125rem]" />
        {t`Settings`}
      </Tag>
      {/* A phone's title row keeps its width for the query; the count stays announced. */}
      <span
        className="shrink-0 font-mono text-caption text-faint tabular-nums max-[599px]:sr-only"
        role="status"
      >
        {plural(count, { one: '# row', other: '# rows' })}
      </span>
      <ShortcutKeys id="menu-close" variant="caps" capSize="sm" className="max-[599px]:hidden" />
      <IconButton
        className="min-[600px]:hidden"
        icon={<CloseIcon />}
        label={t`Clear search`}
        onClick={onClear}
        size="sm"
      />
    </div>
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
  unavailable = {},
  counts,
  onClearFilter,
  compact = false,
}: SettingsNavigationProps & {
  /** Icon and chevron only, so a query field beside it keeps the row's width. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const openingSearch = useRef(false);
  const current = counts ? undefined : hostSection(sections, section);
  const active = sections.find((item) => item.id === current);
  const ActiveIcon = counts ? SearchIcon : active?.icon;
  const activeLabel = counts ? t`Results` : (active?.label ?? t`Sections`);
  const trigger = useRef<HTMLButtonElement>(null);
  // A name too long for the capped picker gives way whole; the page's heading names it.
  const shownLabel = useFittingText(trigger, [activeLabel, ''], cappedLabelRoom);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t`Choose settings section`}
          ref={trigger}
          className={cn(
            'flex h-7 max-w-[calc(100vw-9rem)] min-w-0 shrink items-center gap-1.5 rounded-md border border-input px-2 text-ui font-medium whitespace-nowrap text-foreground outline-none',
            'hover:bg-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-hover',
          )}
          title={
            counts
              ? t`Search results: choose a section`
              : active
                ? t`${ph({ section: active.label })}: choose another section`
                : t`Choose a section`
          }
          type="button"
        >
          {ActiveIcon ? (
            <ActiveIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          {compact || !shownLabel ? null : (
            <span className="min-w-0 truncate" data-fitting-text>
              {shownLabel}
            </span>
          )}
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
          label={t`Settings sections`}
        >
          <CommandInput placeholder={t`Search sections…`} />
          <CommandList className="max-h-[min(70dvh,28rem)]">
            <CommandEmpty>{t`No section matches`}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                aria-label={t`Search everywhere from settings menu`}
                keywords={[t`Search everywhere`]}
                onSelect={() => {
                  openingSearch.current = true;
                  setOpen(false);
                }}
                value="search-everywhere"
              >
                <SearchIcon aria-hidden="true" className="text-muted-foreground" />
                {t`Search everywhere`}
                <CommandShortcut>
                  <ShortcutKeys id="search" variant="inline" />
                </CommandShortcut>
              </CommandItem>
              {counts && onClearFilter ? (
                <CommandItem
                  keywords={[t`Clear search`, t`Show every section`]}
                  onSelect={() => {
                    onClearFilter();
                    setOpen(false);
                  }}
                  value="clear-search"
                >
                  <CloseIcon aria-hidden="true" className="text-muted-foreground" />
                  <span className="truncate">{t`Clear search`}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
            {groupedSettingsSections(sections).map(({ group, items }) => (
              <CommandGroup heading={scopeLabels[group] ?? group} key={group}>
                {items.map(({ id, label, icon: Icon }) => (
                  <CommandItem
                    aria-current={id === current ? 'page' : undefined}
                    data-checked={id === current || undefined}
                    key={id}
                    keywords={[label, scopeLabels[group] ?? group]}
                    onSelect={() => {
                      setOpen(false);
                      void navigate(`/settings/${id}`, {
                        replace: true,
                        state: linkState,
                      });
                    }}
                    value={id}
                  >
                    <Icon aria-hidden="true" className="text-muted-foreground" />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        (unavailable[id] || (counts && !counts[id])) && 'text-faint',
                      )}
                      title={unavailable[id] ? `${label}: ${unavailable[id]}` : label}
                    >
                      {label}
                    </span>
                    {counts ? <ResultCount count={counts[id]} /> : <NavBadge badge={badges[id]} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <PickerFooter
          hints={[
            {
              label: t({ message: 'Move', context: 'keyboard hint verb' }),
              shortcut: 'menu-move',
              optional: true,
            },
            { label: t({ message: 'Open', context: 'keyboard hint verb' }), shortcut: 'menu-pick' },
            {
              label: t({ message: 'Close', context: 'keyboard hint verb' }),
              shortcut: 'menu-close',
              onSelect: () => setOpen(false),
            },
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A section's matching rows in the filtered window: a neutral count, not a waiting badge. */
export function ResultCount({ count }: { count?: number }) {
  if (!count) return null;
  // The space keeps the row's name "Data sources 2", not "Data sources2"; flex layout drops it.
  return (
    <>
      {' '}
      <Tag
        className="ml-auto h-4 px-1.5 tabular-nums"
        title={plural(count, { one: '# matching row', other: '# matching rows' })}
        tone="chip"
        width="auto"
      >
        {count}
      </Tag>
    </>
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
