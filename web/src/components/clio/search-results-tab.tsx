import type { MemorySearchHit } from '@clio/core/v3';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Command, CommandList } from '@/components/ui/command';
import { narrowerThan, useElementWidth } from '@/hooks/use-element-width';
import { COMMAND_MENU_SCOPES, type CommandMenuScope } from '@/lib/command-menu-scopes';
import { isSettingsRoute } from '@/lib/settings-window-route';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  ALL_RESULTS_LIMITS,
  COMMAND_MENU_SCOPE_ICONS,
  commandMenuCounts,
  useCommandMenuOpeners,
  useCommandMenuResults,
  type CommandMenuResource,
} from './command-menu-results';
import { CommandMenuResultGroups } from './command-menu-result-groups';
import { FrameBar } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { TextTabs } from './primitives/text-tabs';
import { RefreshIndicator } from './refresh-button';
import { ResourceLoading } from './resource-states';
import { useGlobalSearchMatches } from './use-global-search-matches';
import { tabForOpenRequest } from './workbench-open-request';
import type { WorkbenchTab } from './workbench-shared';
import { t, plural } from '@lingui/core/macro';

/** Below this width the type tabs show icons, with the chosen one keeping its name. */
const COMPACT_TABS_WIDTH = 640;

const noop = () => {};

/**
 * All results (pickers-search "All results", a spec suggestion): Ctrl Enter on
 * mixed Ctrl K results moves the list here. The same rows as the palette, every
 * match instead of the first few, with the type tabs in the frame bar.
 */
export function SearchResultsTab({
  tab,
  workspaceId,
  sessionId,
  onOpenTab,
  onReplaceTab,
}: {
  tab: Extract<WorkbenchTab, { kind: 'search' }>;
  workspaceId: string;
  sessionId: string;
  onOpenTab: (tab: WorkbenchTab) => void;
  onReplaceTab: (tabId: string, replacement: WorkbenchTab) => void;
}) {
  const { query } = tab;
  const scope = tab.scope ?? 'all';
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, credentialsReady = true, credentialError } = useConnectionSettings();
  const results = useCommandMenuResults({
    enabled: credentialsReady,
    local: true,
    searchText: query,
    serverQuery: query.trim(),
    workspaceId,
    sessionId,
    limits: ALL_RESULTS_LIMITS,
  });
  const global = useGlobalSearchMatches(query, scope, noop);
  const counts = commandMenuCounts(results, global);
  const openRoute = (path: string) =>
    void navigate(path, {
      state: {
        endpoint: settings.endpoint,
        from: location.pathname,
        ...(isSettingsRoute(path) ? { fromSearch: true } : {}),
      },
    });
  const { openWorkspace, openMemoryHit } = useCommandMenuOpeners({
    results,
    sessionId,
    searchText: query,
    openRoute,
  });
  const openResource = (request: CommandMenuResource) =>
    onOpenTab(tabForOpenRequest(request, sessionId, workspaceId));
  const pickScope = (next: CommandMenuScope) => onReplaceTab(tab.id, { ...tab, scope: next });
  const refreshing = results.sessions.isFetching || results.fetching;
  const refresh = () => {
    void results.sessions.refetch();
    void results.workspaces.refetch();
    if (results.files.isEnabled) void results.files.refetch();
    if (results.memory.isEnabled) void results.memory.refetch();
  };
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  const compact = narrowerThan(width, COMPACT_TABS_WIDTH);
  // A type without results leaves the bar (the spec's bar lists only the found
  // types); All, More and the open tab always stay.
  const tabs = COMMAND_MENU_SCOPES.filter(
    (item) =>
      item.value === 'all' || item.value === 'more' || item.value === scope || counts[item.value],
  ).map((item) => ({
    ...item,
    icon: compact ? COMMAND_MENU_SCOPE_ICONS[item.value] : undefined,
    gathers: item.value === 'more',
    count: item.value === 'all' ? undefined : counts[item.value],
  }));
  const loading = !counts.all && (refreshing || results.sessions.isPending);
  const listRef = useRef<HTMLDivElement>(null);
  // Arrive ready for ↑ ↓ and Enter, as the palette was. The palette is still
  // closing when the tab mounts, and its focus trap holds focus until it goes
  // (later on a busy machine), so the list takes focus again whenever it lands
  // on nothing, until the user puts it somewhere else.
  useEffect(() => {
    const list = listRef.current;
    list?.focus({ preventScroll: true });
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const active = document.activeElement;
      const lost = !active || active === document.body;
      if (list?.isConnected && lost) list.focus({ preventScroll: true });
      const elsewhere = !lost && !list?.contains(active) && !active?.closest('[role=dialog]');
      if (tries >= 60 || elsewhere) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [tab.id]);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" ref={frameRef}>
      <FrameBar
        actions={
          <IconButton
            className="[&_svg]:size-3.5"
            disabledReason={refreshing ? 'Searching' : undefined}
            icon={<RefreshIndicator refreshing={refreshing} />}
            label={t`Search again`}
            onClick={refresh}
            size="sm"
          />
        }
        format={
          <TextTabs
            compact={compact}
            label={t`Result type`}
            onValueChange={pickScope}
            tabs={tabs}
            value={scope}
          />
        }
        label={t`Search results`}
        what={
          <span className="tabular-nums" data-frame-position="">
            {loading ? t`Searching…` : plural(counts.all, { one: '# result', other: '# results' })}
          </span>
        }
        where={
          <span
            className="min-w-0 shrink truncate text-menu font-semibold text-foreground"
            data-frame-fit="name"
            title={query}
          >
            {query}
          </span>
        }
      />
      {credentialError ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {credentialError}
        </p>
      ) : null}
      <Command
        className="min-h-0 flex-1 rounded-none! bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        label={t`Results for ${query}`}
        loop
        ref={listRef}
        shouldFilter={false}
        tabIndex={0}
      >
        <CommandList className="max-h-none flex-1 px-2.5 py-1 **:data-[slot=command-item]:min-h-[30px] **:data-[slot=command-item]:py-0.5 **:data-[slot=command-item]:text-menu">
          {loading ? (
            <ResourceLoading className="px-2 py-2" label={t`Searching`} variant="line" />
          ) : !counts[scope] ? (
            <StateView
              kind="empty"
              size="panel"
              title={
                scope === 'all' ? t`Nothing matches “${query}”` : t`Nothing matches “${query}” here`
              }
              action={
                scope === 'all'
                  ? undefined
                  : { label: t`All types`, onClick: () => pickScope('all') }
              }
            />
          ) : null}
          <CommandMenuResultGroups
            global={global}
            onFinish={noop}
            onMore={pickScope}
            onOpenMemoryHit={(hit: MemorySearchHit) => void openMemoryHit(hit)}
            onOpenResource={openResource}
            onOpenWorkspace={(id) => void openWorkspace(id)}
            onRoute={openRoute}
            results={results}
            scope={scope}
            searchText={query}
          />
        </CommandList>
      </Command>
    </div>
  );
}
