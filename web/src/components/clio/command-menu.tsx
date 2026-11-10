import { vocab } from '@/lib/brand-vocabulary';
import { LoaderCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useMenuAction } from '@/tauri/menu-actions';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { brand } from '@brand';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import { Command, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command';
import { SEARCH_DEBOUNCE_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';
import { ClioSearchAssistant } from './search-assistant';
import { connectionScope } from '@/lib/connection-scope';
import {
  ALL_SCOPE_GROUP_LIMIT,
  COMMAND_MENU_SCOPES,
  adjacentCommandMenuScope,
  parseCommandMenuQuery,
  withoutCommandMenuPrefix,
  type CommandMenuScope,
} from '@/lib/command-menu-scopes';
import { useMediaQuery } from '@/hooks/use-media-query';
import { GlobalSearchMatchesScope } from './global-search-results';
import type { GlobalSearchMatches } from './use-global-search-matches';
import {
  COMMAND_MENU_LIMITS,
  COMMAND_MENU_SCOPE_ICONS,
  commandMenuCounts,
  useCommandMenuOpeners,
  useCommandMenuResults,
} from './command-menu-results';
import { CommandMenuResultGroups } from './command-menu-result-groups';
import { CommandMenuNoMatch } from './command-menu-no-match';
import { TextTabs } from './primitives/text-tabs';
import { PickerFooter, type PickerHint } from './primitives/picker-footer';
import { StateView } from './primitives/state-view';
import { isOfflineError } from '@/lib/list-state';
import { isSettingsRoute } from '@/lib/settings-window-route';
import {
  returnRouteFromState,
  workspaceIdFromRoute,
  sessionIdFromRoute,
  newConversationRoute,
} from '@/lib/workspace-route-memory';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function ClioCommandMenu({
  onOpenResource,
}: {
  onOpenResource?: (request: ClioWorkbenchOpenRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<CommandMenuScope>('all');
  const [serverQuery, setServerQuery] = useState('');
  const setVisible = useCommandMenuVisibility((state) => state.setOpen);
  const changeOpen = useCallback(
    (value: boolean) => {
      setVisible(value);
      setOpen(value);
      if (!value) {
        setQuery('');
        setScope('all');
        setAiMode(false);
      }
    },
    [setVisible],
  );
  useEffect(() => () => setVisible(false), [setVisible]);
  const searchInput = useRef<HTMLInputElement>(null);
  const { text: searchText, prefixScope } = parseCommandMenuQuery(query);
  const activeScope = prefixScope ?? scope;
  const compactTabs = useMediaQuery('(max-width: 899px)');
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, credentialsReady = true, credentialError } = useConnectionSettings();
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const routeParams = useParams();
  // Make parser results scalar dependencies so React Compiler preserves the result caches.
  const currentWorkspaceId = workspaceIdFromRoute(location.pathname);
  const currentSessionId = sessionIdFromRoute(location.pathname);
  const workspaceId = String(
    routeParams.workspaceId ?? currentWorkspaceId ?? workspaceIdFromRoute(workspaceRoute) ?? '',
  );
  const sessionId = String(
    routeParams.sessionId ??
      currentSessionId ??
      (currentWorkspaceId ? undefined : sessionIdFromRoute(workspaceRoute)) ??
      '',
  );
  const results = useCommandMenuResults({
    enabled: open && credentialsReady,
    local: !aiMode,
    searchText,
    serverQuery,
    workspaceId,
    sessionId,
    limits: COMMAND_MENU_LIMITS,
  });
  const { workspaces } = results;

  useShortcut('search', () => changeOpen(!open), { overrideHandled: true });
  useMenuAction('search', () => changeOpen(true));
  useEffect(() => {
    const openMenu = () => changeOpen(true);
    window.addEventListener('clio:open-command-menu', openMenu);
    return () => window.removeEventListener('clio:open-command-menu', openMenu);
  }, [changeOpen]);
  useEffect(() => {
    const timer = window.setTimeout(() => setServerQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    if (open && !aiMode) searchInput.current?.focus();
  }, [open, aiMode]);
  // Ctrl Enter may move the list into a tab: have its code ready before then.
  useEffect(() => {
    if (open) void import('./search-results-tab');
  }, [open]);

  const searchWorkspaceId = workspaceId || workspaces.data?.[0]?.id;

  const finish = (action: () => void) => {
    changeOpen(false);
    action();
  };
  const openRoute = (path: string) =>
    finish(() =>
      navigate(path, {
        state: {
          endpoint: settings.endpoint,
          from: location.pathname.startsWith('/workspaces/') ? location.pathname : workspaceRoute,
          // Settings marks the setting the search opened.
          ...(isSettingsRoute(path) ? { fromSearch: true } : {}),
        },
      }),
    );
  const { latestSessionIn, openWorkspace, openMemoryHit } = useCommandMenuOpeners({
    results,
    sessionId,
    searchText,
    openRoute,
  });
  const openResource = async (request: ClioWorkbenchOpenRequest) => {
    if (onOpenResource) return finish(() => onOpenResource(request));
    const targetWorkspace =
      request.kind === 'artifact'
        ? request.artifact.workspace_id
        : request.kind === 'workspace-file'
          ? (request.workspaceId ?? workspaceId)
          : workspaceId;
    const target = targetWorkspace
      ? await latestSessionIn(targetWorkspace).catch(() => undefined)
      : undefined;
    const targetRoute =
      request.kind === 'workspace-file' &&
      targetWorkspace &&
      location.pathname === newConversationRoute(targetWorkspace)
        ? location.pathname
        : target
          ? `/workspaces/${encodeURIComponent(target.workspace_id)}/sessions/${encodeURIComponent(target.id)}`
          : undefined;
    if (!targetRoute) {
      toast.error('Open a conversation in this workspace to view this file.');
      return;
    }
    const snapshot =
      request.kind === 'artifact'
        ? { ...request, artifact: { ...request.artifact } }
        : { ...request };
    finish(() =>
      navigate(targetRoute, {
        state: { globalSearchResource: { scope: connectionScope(settings), request: snapshot } },
      }),
    );
  };

  const { searching, memory } = results;
  const groupLimit = activeScope === 'all' ? ALL_SCOPE_GROUP_LIMIT : undefined;
  const pickScope = (next: CommandMenuScope) => {
    if (prefixScope) setQuery(withoutCommandMenuPrefix(query));
    setScope(next);
    searchInput.current?.focus();
  };
  const scopeCounts = (global: GlobalSearchMatches) => commandMenuCounts(results, global);
  // Every result is a setting: Ctrl Enter opens Settings filtered to them.
  const settingsResultsRoute = (
    global: GlobalSearchMatches,
    counts: Record<CommandMenuScope, number>,
  ) => {
    if (!searching || !counts.settings) return undefined;
    if (activeScope !== 'settings' && counts.settings !== counts.all) return undefined;
    const first = global.commands.Settings[0]?.action;
    const route = first && 'route' in first ? first.route : '/settings/agents';
    return `${route.split('#')[0]}?q=${encodeURIComponent(searchText.trim())}`;
  };
  // Mixed results: Ctrl Enter moves the whole list into a workbench tab.
  const allResultsAction = (counts: Record<CommandMenuScope, number>, settingsRoute?: string) =>
    searching && counts.all > 0 && !settingsRoute
      ? () => void openResource({ kind: 'search', query: searchText.trim(), scope: activeScope })
      : undefined;
  const searchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    settingsRoute?: string,
    openAllResults?: () => void,
  ) => {
    if (event.nativeEvent.isComposing) return;
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === 'Tab' && !event.shiftKey && credentialsReady && searchWorkspaceId) {
      event.preventDefault();
      setAiMode(true);
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      // Ctrl Enter is the "All results" key, never a second Enter: with every
      // result a setting it opens Settings filtered to them; mixed results move
      // into the All results workbench tab.
      event.preventDefault();
      if (settingsRoute) openRoute(settingsRoute);
      else openAllResults?.();
      return;
    }
    if (event.key === 'Backspace' && !query && scope !== 'all') {
      event.preventDefault();
      setScope('all');
      return;
    }
    if (modified || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const input = event.currentTarget;
    const edge = event.key === 'ArrowRight' ? input.value.length : 0;
    if (input.selectionStart !== edge || input.selectionEnd !== edge) return;
    const next = adjacentCommandMenuScope(activeScope, event.key === 'ArrowRight' ? 1 : -1);
    if (!next) return;
    event.preventDefault();
    pickScope(next);
  };
  const scopeLabel = COMMAND_MENU_SCOPES.find((item) => item.value === activeScope)?.label ?? '';
  const { fetching } = results;
  const emptyText = memory.isFetching
    ? 'Searching conversations…'
    : results.sessions.isLoading || results.workspaces.isLoading
      ? 'Loading conversations…'
      : !searching && (activeScope === 'files' || activeScope === 'artifacts')
        ? `Type to find ${activeScope === 'files' ? 'a workspace file' : 'a session artifact'}.`
        : 'Nothing here yet.';
  // A list the search reads failed: say which, with Retry, above whatever did load.
  const failure = (
    [
      [results.sessions, 'Conversations could not be listed'],
      [results.workspaces, 'Workspaces could not be listed'],
      [memory, 'Conversations could not be searched'],
    ] as const
  ).filter(([query]) => query.isError && query.data === undefined);
  const canAsk = credentialsReady && Boolean(searchWorkspaceId);

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className={`top-[10dvh] max-h-[80dvh] max-w-[calc(100vw-1rem)] translate-y-0 overflow-hidden p-0 sm:max-w-[calc(100vw-1rem)] ${aiMode ? 'w-[min(max(30rem,60vw),48rem)]' : 'w-[clamp(420px,50vw,720px)]'} max-[480px]:w-[98vw] max-[480px]:max-w-[98vw]`}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (aiMode) {
            event.preventDefault();
            setAiMode(false);
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{brand.name} search</DialogTitle>
          <DialogDescription>
            Search conversations, matching passages, files, settings, or ask the search assistant.
          </DialogDescription>
        </DialogHeader>
        {aiMode && searchWorkspaceId ? (
          <ClioSearchAssistant
            key={connectionScope(settings)}
            workspaceId={searchWorkspaceId}
            parentSessionId={sessionId || undefined}
            query={searchText}
            onQueryChange={setQuery}
            onBack={() => setAiMode(false)}
            onClose={() => finish(() => {})}
            onOpenResource={openResource}
          />
        ) : (
          <Command shouldFilter={false}>
            <GlobalSearchMatchesScope
              query={searchText}
              scope={activeScope}
              onFinish={() => finish(() => {})}
            >
              {(global) => {
                const counts = scopeCounts(global);
                const settingsRoute = settingsResultsRoute(global, counts);
                const openAllResults = allResultsAction(counts, settingsRoute);
                const hints: PickerHint[] = [
                  { label: 'Close', shortcut: 'menu-close', optional: true },
                  activeScope !== 'all' && !searchText
                    ? { label: 'All types', shortcut: 'menu-all-types', optional: true }
                    : { label: 'Change type', shortcut: 'menu-type', optional: true },
                  { label: 'Open', shortcut: 'menu-pick' },
                  ...(settingsRoute
                    ? [
                        {
                          label: 'All in Settings',
                          shortcut: 'menu-all-results',
                          accent: true,
                          onSelect: () => openRoute(settingsRoute),
                        },
                      ]
                    : []),
                  ...(openAllResults
                    ? [
                        {
                          label: 'All results',
                          shortcut: 'menu-all-results' as const,
                          onSelect: openAllResults,
                        },
                      ]
                    : []),
                  {
                    label: `Ask ${vocab.agent}`,
                    shortcut: 'menu-ask',
                    onSelect: () => setAiMode(true),
                    disabled: !canAsk,
                    end: true,
                  },
                ];
                const noMatch = searching && !fetching && counts[activeScope] === 0;
                return (
                  <>
                    <CommandInput
                      ref={searchInput}
                      autoFocus
                      flush
                      className="min-w-0"
                      onValueChange={setQuery}
                      placeholder="Search work, files, artifacts, or actions…"
                      value={query}
                      trailing={
                        searching ? (
                          <span
                            aria-live="polite"
                            className="flex shrink-0 items-center gap-1.5 pr-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
                          >
                            {fetching && !counts.all ? (
                              <LoaderCircleIcon
                                aria-label="Searching"
                                className="size-3.5 motion-safe:animate-spin"
                              />
                            ) : (
                              `${counts.all} ${counts.all === 1 ? 'result' : 'results'}`
                            )}
                          </span>
                        ) : null
                      }
                      onKeyDown={(event) => searchKeyDown(event, settingsRoute, openAllResults)}
                    />
                    <div className="border-b px-3">
                      <TextTabs
                        keepFocus
                        compact={compactTabs}
                        label="Result type"
                        onValueChange={pickScope}
                        tabs={COMMAND_MENU_SCOPES.map((tab) => ({
                          ...tab,
                          icon: compactTabs ? COMMAND_MENU_SCOPE_ICONS[tab.value] : undefined,
                          gathers: tab.value === 'more',
                          count: searching ? counts[tab.value] : undefined,
                        }))}
                        value={activeScope}
                      />
                    </div>
                    {!credentialsReady && !credentialError ? (
                      <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
                        Waiting for the default backend…
                      </p>
                    ) : null}
                    {credentialError ? (
                      <p role="alert" className="px-3 py-2 text-xs text-destructive">
                        {credentialError}
                      </p>
                    ) : null}
                    <CommandList className="max-h-[min(60dvh,34rem)] **:data-[slot=command-item]:min-h-[30px] **:data-[slot=command-item]:py-0.5 **:data-[slot=command-item]:text-[12.5px]">
                      {failure.length ? (
                        <StateView
                          action={{
                            label: 'Retry',
                            onClick: () => {
                              for (const [query] of failure) void query.refetch();
                            },
                          }}
                          className="px-3"
                          detail={isOfflineError(failure[0]![0].error) ? 'Offline' : undefined}
                          kind="error"
                          size="row"
                          title={failure[0]![1]}
                        />
                      ) : null}
                      {noMatch ? (
                        <CommandMenuNoMatch
                          canAsk={canAsk}
                          onAllTypes={activeScope === 'all' ? undefined : () => pickScope('all')}
                          onAsk={() => setAiMode(true)}
                          query={searchText.trim()}
                          scope={activeScope === 'all' ? undefined : scopeLabel}
                          total={counts.all}
                        />
                      ) : (
                        <CommandEmpty>{emptyText}</CommandEmpty>
                      )}
                      <CommandMenuResultGroups
                        global={global}
                        limit={groupLimit}
                        onFinish={() => finish(() => {})}
                        onMore={pickScope}
                        onOpenMemoryHit={(hit) => void openMemoryHit(hit)}
                        onOpenResource={(request) => void openResource(request)}
                        onOpenWorkspace={(id) => void openWorkspace(id)}
                        onRoute={openRoute}
                        results={results}
                        scope={activeScope}
                        searchText={searchText}
                      />
                    </CommandList>
                    <PickerFooter hints={hints} />
                  </>
                );
              }}
            </GlobalSearchMatchesScope>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}
