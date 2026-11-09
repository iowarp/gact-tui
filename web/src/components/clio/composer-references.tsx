import type { WorkspaceReference } from '@clio/core/v3';
import { onComposerRowDegraded } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import {
  createElement,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { MenuKeyHints } from '@/components/clio/primitives/menu-key-hints';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { QUERY_STALE_TIME_MS, REFERENCE_ROW_LIMIT, SEARCH_DEBOUNCE_MS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import {
  isSummonReference,
  matchingSummons,
  workspaceReferenceIdentity,
} from '@/lib/composer-reference-domain';
import { hdf5DrillQuery, useHdf5ReferenceRows } from './composer-hdf5-references';
import { publishActiveOption } from './composer-reference-controller-active-option';
import { referenceKindIcon } from './composer-reference-presentation';
import { ComposerSuggestionPopup } from './composer-suggestion-popup';

const groups: Array<{
  defaultOpen: boolean;
  browseOpen?: boolean;
  kinds: WorkspaceReference['kind'][];
  label: string;
}> = [
  // An @ mention starts with only local files open (`defaultOpen`); typing shows each
  // category's matches. The "Reference existing context" picker is for browsing, so it
  // opens the common categories (`browseOpen`). What can be summoned comes first.
  { defaultOpen: false, browseOpen: true, kinds: ['subagent'], label: 'Agents' },
  { defaultOpen: false, browseOpen: true, kinds: ['workflow'], label: 'Workflows' },
  { defaultOpen: false, browseOpen: true, kinds: ['flow'], label: 'Flows' },
  { defaultOpen: false, browseOpen: true, kinds: ['server'], label: 'Tools' },
  { defaultOpen: true, browseOpen: true, kinds: ['workspace_file'], label: 'Workspace files' },
  // Uploaded files and tool-observed evidence have different wire identities, but both are
  // user-facing sources. Artifacts remain reserved for generated or registered outputs.
  {
    defaultOpen: false,
    browseOpen: true,
    kinds: ['resource', 'evidence_source'],
    label: 'Sources',
  },
  { defaultOpen: false, browseOpen: true, kinds: ['artifact'], label: 'Artifacts' },
  { defaultOpen: false, kinds: ['session'], label: 'Conversations' },
  { defaultOpen: false, kinds: ['agent_run'], label: 'Agents and runs' },
  { defaultOpen: false, kinds: ['context_frame'], label: 'Context records' },
  { defaultOpen: false, kinds: ['diff'], label: 'Changed files' },
  { defaultOpen: false, kinds: ['plan'], label: 'Plans' },
];

/** Kinds the workspace reference search serves (summon targets come from the session). */
const nonFileKinds = groups
  .flatMap((group) => group.kinds)
  .filter((kind) => kind !== 'workspace_file' && !isSummonReference({ kind }));

/**
 * Rows mounted in the frame the menu opens: a little more than the ~10 rows its
 * 380px fit. The rest of a listing (up to REFERENCE_ROW_LIMIT) mounts in an
 * idle, interruptible transition, so typing `@` paints the menu without first
 * building a hundred rows nobody can see yet.
 */
const FIRST_FRAME_ROWS = 12;

const NO_SUMMONS: readonly WorkspaceReference[] = [];

const KEY_HINTS = [
  { id: 'menu-move', label: 'Move' },
  { id: 'menu-pick', label: 'Add' },
  { id: 'menu-close', label: 'Close' },
] as const;

/** What the composer's keyboard asks of the open menu while the editor keeps focus. */
export interface ReferenceMenuHandle {
  /** Moves the highlight one row; false when nothing is listed. */
  move: (direction: 1 | -1) => boolean;
  /** The highlighted reference, which Enter adds and Tab looks inside. */
  active: () => WorkspaceReference | undefined;
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

/** FIRST_FRAME_ROWS until the browser is idle after opening, then every row. */
function useRowBudget(): number {
  const [budget, setBudget] = useState(FIRST_FRAME_ROWS);
  useEffect(() => {
    const expand = () => startTransition(() => setBudget(Number.POSITIVE_INFINITY));
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(expand, { timeout: 200 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(expand, 16);
    return () => window.clearTimeout(handle);
  }, []);
  return budget;
}

function conciseDetail(reference: WorkspaceReference): string {
  // The server joins reference details with a middle dot; never show it (UI copy rule).
  return reference.detail
    .replace(/\s+\u00b7\s+(?:source|sha256):[^\s]+$/iu, '')
    .replace(/\s+\u00b7\s+/gu, ' — ');
}

/** The faint words after a row's name: a file's folder, otherwise its detail. */
function rowDetail(reference: WorkspaceReference): string {
  if (reference.kind === 'workspace_file' && !reference.navigation['locator']) {
    const slash = reference.id.lastIndexOf('/');
    return slash > 0 ? reference.id.slice(0, slash) : '';
  }
  return conciseDetail(reference);
}

function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-accent-foreground">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

/** One 30px suggestion: kind icon, name, faint folder or detail, and its keys. */
const ReferenceOption = memo(function ReferenceOption({
  active,
  id,
  name,
  onPick,
  query,
  reference,
}: {
  active: boolean;
  id: string;
  name: string;
  onPick: (reference: WorkspaceReference) => void;
  query: string;
  reference: WorkspaceReference;
}) {
  const detail = rowDetail(reference);
  const drillable = Boolean(hdf5DrillQuery(reference));
  return (
    // The editor or search box keeps focus and owns the keys (aria-activedescendant);
    // a press only picks, and must not take focus from them.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      aria-label={`${reference.label} ${conciseDetail(reference)}`}
      aria-selected={active}
      className={cn(
        'flex h-[30px] min-w-0 cursor-default items-center gap-[9px] rounded-[7px] px-2 whitespace-nowrap hover:bg-hover',
        active && 'bg-menu-highlight hover:bg-menu-highlight',
      )}
      id={id}
      onClick={() => onPick(reference)}
      onMouseDown={keepFocus}
      role="option"
      title={conciseDetail(reference) || undefined}
    >
      {createElement(referenceKindIcon(reference.kind), {
        'aria-hidden': true,
        className: 'size-[15px] shrink-0 text-muted-foreground',
      })}
      <span className="min-w-0 shrink truncate text-foreground">
        <Highlighted query={query} text={name} />
      </span>
      {detail ? (
        <span className="min-w-0 shrink-[100] truncate text-[11.5px] text-faint">{detail}</span>
      ) : null}
      {drillable || active ? (
        <span className="ml-auto flex shrink-0 items-center gap-[11px] pl-2 text-[11px] text-faint">
          {drillable ? <span>Tab to look inside</span> : null}
          {active ? <ShortcutKeys id="menu-pick" variant="inline" /> : null}
        </span>
      ) : null}
    </div>
  );
});

interface Section {
  label: string;
  /** Every match, so a collapsed group still says how many it holds. */
  rows: readonly WorkspaceReference[];
  open: boolean;
  /** The count shown beside the heading; an ellipsis while it is still unknown. */
  count: string;
  collapsible: boolean;
}

export function ClioComposerReferenceMenu({
  handleRef,
  onDismiss,
  onRestoreFocus,
  onSelect,
  popoverId,
  query: mentionQuery,
  searchInput,
  summons = NO_SUMMONS,
  workspaceId,
}: {
  /** Lets the composer's editor move the highlight and read it while it keeps focus. */
  handleRef?: Ref<ReferenceMenuHandle>;
  /** Escape, or a press outside this surface. */
  onDismiss: () => void;
  /** Hand focus back to the composer when this surface has no input of its own. */
  onRestoreFocus: () => void;
  onSelect: (reference: WorkspaceReference) => void;
  /** The id the editor's `aria-controls` names; the popup carries it. */
  popoverId: string;
  /** The typed mention after `@`, or the picker's first search. */
  query: string;
  /** Browsing from the + menu: the menu has its own search box. */
  searchInput: boolean;
  /** The conversation's subagents and MCP servers, as summonable rows. */
  summons?: readonly WorkspaceReference[];
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const searchRef = useRef<HTMLInputElement>(null);
  // The picker's search is the menu's own state, so typing in it re-renders the
  // menu rather than the composer that hosts it.
  const [searchQuery, setSearchQuery] = useState(mentionQuery);
  const query = searchInput ? searchQuery : mentionQuery;
  const trimmedQuery = query.trim();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.label,
        searchInput ? (group.browseOpen ?? group.defaultOpen) : group.defaultOpen,
      ]),
    ),
  );
  /**
   * Whichever control drives this surface keeps the keyboard: its own search
   * box when it has one, the composer's editor when the person typed `@`.
   */
  const restoreFocus = useCallback(() => {
    if (searchInput && searchRef.current) searchRef.current.focus();
    else onRestoreFocus();
  }, [onRestoreFocus, searchInput]);
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const isSearching = Boolean(trimmedQuery);
  // `file.h5::/group/` lists that group's objects instead of searching the workspace.
  const hdf5 = useHdf5ReferenceRows(workspaceId, trimmedQuery);
  const requestedKinds = debouncedQuery ? [] : nonFileKinds;
  const requestedKindsKey = requestedKinds.join(',');
  const references = useQuery({
    enabled: Boolean(workspaceId) && !hdf5.mention,
    queryKey: queryKeys.workspaceReferences(
      settings.endpoint,
      workspaceId,
      debouncedQuery,
      requestedKindsKey,
    ),
    queryFn: ({ signal }) =>
      repository.workspaceReferences(
        workspaceId,
        { q: debouncedQuery, kinds: requestedKinds },
        signal,
      ),
    // While the next search runs, keep this workspace's last results (narrowed
    // to what is typed below) instead of flashing an empty list per keystroke.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === workspaceId ? previous : undefined,
    staleTime: QUERY_STALE_TIME_MS,
  });
  const localFiles = useQuery({
    enabled: Boolean(workspaceId) && !isSearching && openGroups['Workspace files'],
    queryKey: queryKeys.workspaceReferences(settings.endpoint, workspaceId, '', 'workspace_file'),
    queryFn: ({ signal }) =>
      repository.workspaceReferences(workspaceId, { kinds: ['workspace_file'] }, signal),
    staleTime: QUERY_STALE_TIME_MS,
  });
  // Older servers may return an unbounded workspace inventory. Keep the
  // menu responsive even when connected to one of them.
  const listing = useMemo(() => {
    // React Query retains the collapsed inventory in its cache after the user
    // starts typing. Do not mix those stale unfiltered files into live search
    // results; a query must reflect only the bounded server search.
    const summoned = matchingSummons(summons, query);
    // Until the server has searched for exactly what is typed, show only the
    // rows already listed that contain it.
    const lagging = references.isPlaceholderData || debouncedQuery !== trimmedQuery;
    const needle = trimmedQuery.toLowerCase();
    const served = (references.data ?? []).filter(
      (reference) =>
        !lagging ||
        !needle ||
        reference.label.toLowerCase().includes(needle) ||
        reference.id.toLowerCase().includes(needle),
    );
    const combined = [...summoned, ...served, ...(!isSearching ? (localFiles.data ?? []) : [])];
    const identities = new Set<string>();
    const deduplicated = combined.filter((reference) => {
      const identity = workspaceReferenceIdentity(reference);
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
    // A kind this build has no group for cannot be offered — selecting it would
    // put a `ref_kind` on the wire that neither side agreed on. It is counted so
    // the footer can say the listing is short rather than hiding the gap.
    const supported = groups.flatMap((group) =>
      deduplicated.filter((reference) => group.kinds.includes(reference.kind)),
    );
    return {
      rows: supported.slice(0, REFERENCE_ROW_LIMIT),
      unsupported: deduplicated.length - supported.length,
    };
  }, [
    debouncedQuery,
    isSearching,
    localFiles.data,
    query,
    references.data,
    references.isPlaceholderData,
    summons,
    trimmedQuery,
  ]);

  // Rows the contract refused are reported through the shared degradation
  // catalog rather than returned, so the menu counts them while it is open.
  const [unreadable, setUnreadable] = useState(0);
  useEffect(
    () =>
      onComposerRowDegraded((degradation) => {
        if (degradation.collection === 'workspace_references') setUnreadable((count) => count + 1);
      }),
    [],
  );

  const localFilesKnown = localFiles.isFetched;
  const sections = useMemo((): Section[] => {
    if (hdf5.mention)
      return [
        {
          collapsible: false,
          count: String(hdf5.rows.length),
          label: `Inside ${hdf5.mention.file.split('/').at(-1)} — ${hdf5.mention.group}`,
          open: true,
          rows: hdf5.rows,
        },
      ];
    return groups.flatMap((group) => {
      const matches = listing.rows.filter((row) => group.kinds.includes(row.kind));
      const alwaysVisible = !isSearching && group.label === 'Workspace files';
      if (!matches.length && !alwaysVisible) return [];
      return [
        {
          collapsible: true,
          count:
            group.label === 'Workspace files' && !isSearching && !localFilesKnown
              ? '…'
              : String(matches.length),
          label: group.label,
          open: isSearching || Boolean(openGroups[group.label]),
          rows: matches,
        },
      ];
    });
  }, [hdf5.mention, hdf5.rows, isSearching, listing.rows, localFilesKnown, openGroups]);

  const visibleRows = useMemo(
    () => sections.flatMap((section) => (section.open ? section.rows : [])),
    [sections],
  );
  const identities = useMemo(() => visibleRows.map(workspaceReferenceIdentity), [visibleRows]);

  // The highlight lives here, not in the composer: arrowing re-renders this
  // menu and the editor's aria-activedescendant, never the composer around them.
  const [activeIdentity, setActiveIdentity] = useState<string>();
  const found = activeIdentity ? identities.indexOf(activeIdentity) : -1;
  const activeIndex = identities.length ? Math.max(found, 0) : -1;
  const optionId = useCallback(
    (identity: string) => `${popoverId}-option-${encodeURIComponent(identity)}`,
    [popoverId],
  );
  const activeOptionId = activeIndex >= 0 ? optionId(identities[activeIndex]!) : undefined;
  const scrollToActive = useRef(false);

  useEffect(() => {
    publishActiveOption(popoverId, activeOptionId);
    if (!scrollToActive.current || !activeOptionId) return;
    scrollToActive.current = false;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId, popoverId]);
  useEffect(() => () => publishActiveOption(popoverId, undefined), [popoverId]);

  const latest = useRef({ activeIndex, visibleRows });
  useLayoutEffect(() => {
    latest.current = { activeIndex, visibleRows };
  }, [activeIndex, visibleRows]);
  const handle = useMemo<ReferenceMenuHandle>(
    () => ({
      active: () => {
        const { activeIndex: index, visibleRows: rows } = latest.current;
        return index >= 0 ? rows[index] : undefined;
      },
      move: (direction) => {
        const { activeIndex: index, visibleRows: rows } = latest.current;
        if (!rows.length) return false;
        const next = (Math.max(index, 0) + direction + rows.length) % rows.length;
        scrollToActive.current = true;
        // Two keys in one frame each move one row, before React commits the first.
        latest.current = { activeIndex: next, visibleRows: rows };
        setActiveIdentity(workspaceReferenceIdentity(rows[next]!));
        return true;
      },
    }),
    [],
  );
  useImperativeHandle(handleRef, () => handle, [handle]);

  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pick = useCallback((reference: WorkspaceReference) => onSelectRef.current(reference), []);

  const budget = Math.max(useRowBudget(), activeIndex + 1);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (handle.move(event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
      return;
    }
    if (event.shiftKey || event.nativeEvent.isComposing) return;
    const active = handle.active();
    if (!active) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(active);
    } else if (event.key === 'Tab') {
      const inside = hdf5DrillQuery(active);
      if (!inside) return;
      event.preventDefault();
      setSearchQuery(inside);
    }
  };

  const rowName = (reference: WorkspaceReference) =>
    hdf5.mention ? String(reference.navigation['locator'] ?? reference.label) : reference.label;
  const highlight = hdf5.mention ? hdf5.mention.filter : trimmedQuery;
  // How many of each open group's rows fit in this frame's budget, in order.
  const mountedRows = sections.reduce<number[]>((counts, section) => {
    const used = counts.reduce((sum, count) => sum + count, 0);
    counts.push(section.open ? Math.min(section.rows.length, Math.max(0, budget - used)) : 0);
    return counts;
  }, []);

  const emptyText = hdf5.mention
    ? hdf5.listing.isError
      ? `${hdf5.mention.file} cannot be read as HDF5 here.`
      : hdf5.listing.isFetching
        ? `Reading ${hdf5.mention.group} in ${hdf5.mention.file}…`
        : 'No objects match.'
    : references.isError || localFiles.isError
      ? 'References are unavailable from the connected service.'
      : references.isFetching || localFiles.isFetching
        ? 'Searching workspace context…'
        : 'No workspace context matches.';
  const total = hdf5.mention ? hdf5.rows.length : listing.rows.length;
  const settled = hdf5.mention ? !hdf5.listing.isFetching : !references.isFetching;

  return (
    <ComposerSuggestionPopup onDismiss={onDismiss} popupId={popoverId}>
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 pr-2 pl-3">
        <SearchIcon aria-hidden="true" className="size-[15px] shrink-0 text-muted-foreground" />
        {searchInput ? (
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={`${popoverId}-listbox`}
            aria-expanded="true"
            aria-label="Search workspace context"
            autoFocus
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search evidence, files, conversations, and agent runs…"
            ref={searchRef}
            role="combobox"
            value={searchQuery}
          />
        ) : (
          <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[13px]">
            <span className="text-foreground">@{query}</span>
            {query ? null : <span className="text-faint"> type to search</span>}
          </span>
        )}
        {settled || total ? (
          <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">
            {total === 1 ? '1 match' : `${total} matches`}
          </span>
        ) : null}
      </div>
      <div
        aria-label="Suggestions"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-1.5 pt-0.5 pb-1.5"
        id={`${popoverId}-listbox`}
        role="listbox"
      >
        {visibleRows.length === 0 ? (
          <div className="flex h-[30px] min-w-0 items-center px-2 text-[12px] text-faint">
            <span className="truncate">{emptyText}</span>
          </div>
        ) : null}
        {sections.map((section, index) => {
          const rendered = section.rows.slice(0, mountedRows[index]);
          const heading = (
            <>
              {section.collapsible ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className={cn(
                    'size-3 shrink-0 text-faint motion-safe:transition-transform',
                    section.open && 'rotate-90',
                  )}
                />
              ) : null}
              <span className="min-w-0 truncate">{section.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[10.5px] font-normal text-faint tabular-nums">
                {section.count}
              </span>
            </>
          );
          const headingClass =
            'flex w-full min-w-0 items-center gap-[7px] px-2 pt-[9px] pb-[3px] text-left text-[11px] font-semibold whitespace-nowrap text-muted-foreground';
          return (
            <div aria-label={section.label} key={section.label} role="group">
              {section.collapsible ? (
                <button
                  aria-expanded={section.open}
                  aria-label={`${section.open ? 'Collapse' : 'Expand'} ${section.label}`}
                  className={cn(headingClass, 'rounded-[6px] hover:text-foreground')}
                  onClick={() => {
                    setOpenGroups((current) => ({
                      ...current,
                      [section.label]: !section.open,
                    }));
                    window.requestAnimationFrame(restoreFocus);
                  }}
                  onMouseDown={keepFocus}
                  tabIndex={-1}
                  type="button"
                >
                  {heading}
                </button>
              ) : (
                <div className={headingClass}>{heading}</div>
              )}
              {rendered.map((reference) => {
                const identity = workspaceReferenceIdentity(reference);
                return (
                  <ReferenceOption
                    active={identities[activeIndex] === identity}
                    id={optionId(identity)}
                    key={identity}
                    name={rowName(reference)}
                    onPick={pick}
                    query={highlight}
                    reference={reference}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      {unreadable + listing.unsupported > 0 ? (
        <div
          className="flex shrink-0 flex-col gap-0.5 border-t px-2.5 py-1.5 text-[11px] text-muted-foreground"
          role="status"
        >
          {unreadable > 0 ? (
            <span>
              {unreadable === 1
                ? '1 reference could not be read from this workspace.'
                : `${unreadable} references could not be read from this workspace.`}
            </span>
          ) : null}
          {listing.unsupported > 0 ? (
            <span>
              {listing.unsupported === 1
                ? '1 reference needs a newer version of this app.'
                : `${listing.unsupported} references need a newer version of this app.`}
            </span>
          ) : null}
        </div>
      ) : null}
      <MenuKeyHints className="h-[34px] shrink-0 px-2.5 text-faint" hints={KEY_HINTS} />
    </ComposerSuggestionPopup>
  );
}
