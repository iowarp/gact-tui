import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import type { Artifact, MemorySearchHit } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  BoxIcon,
  FileIcon,
  FolderIcon,
  LayersIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  ZapIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { brand } from '@brand';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useRepository } from '@/hooks/use-repository';
import {
  isPrimarySession,
  PRIMARY_SESSION_KINDS,
  sessionInteractionAt,
} from '@/lib/recent-sessions';
import { SEARCH_DEBOUNCE_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioRelativeTime } from './relative-time';
import { useLiveStore } from '@/store/live-store';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';
import { ClioSearchAssistant } from './search-assistant';
import { SearchHighlight } from './search-highlight';
import { messageSearchHash } from '@/lib/search-matches';
import { projectText } from '@/lib/attention-text';
import { connectionScope } from '@/lib/connection-scope';
import { MoreIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import {
  ALL_SCOPE_GROUP_LIMIT,
  COMMAND_MENU_SCOPES,
  adjacentCommandMenuScope,
  capRows,
  inCommandMenuScope,
  parseCommandMenuQuery,
  withoutCommandMenuPrefix,
  type CommandMenuScope,
} from '@/lib/command-menu-scopes';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  GlobalSearchGroups,
  GlobalSearchMatchesScope,
  MoreResultsItem,
  ResultsHeading,
} from './global-search-results';
import type { GlobalSearchMatches } from './use-global-search-matches';
import { TextTabs } from './primitives/text-tabs';
import { PickerFooter, type PickerHint } from './primitives/picker-footer';
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

/**
 * How many results each command-menu group shows. Unit: entries per group.
 * The menu is a keyboard jump list, so every group has to stay scannable
 * without scrolling; raise a value only if a group routinely hides the entry
 * people are reaching for.
 */
const COMMAND_MENU_LIMITS = {
  /** Workspace files matching the typed query. */
  files: 16,
  /** Session artifacts matching the typed query. */
  artifacts: 12,
  /** Remembered-context hits fetched from the backend per query. */
  memoryHits: 12,
  /** Sessions shown while searching, where the query already narrows them. */
  searchedSessions: 20,
  /** Sessions shown on open, before anything is typed. */
  recentSessions: 10,
} as const;

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
  const [recentThreshold] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useRepository();
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
  const artifacts = useLiveStore((state) => state.entities.artifacts);
  const workspaces = useQuery({
    enabled: open && credentialsReady,
    queryKey: queryKeys.key('workspaces', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  // One page from the server: the newest conversations, or the titles matching the
  // (debounced) query. The menu never loads every session.
  const sessions = useQuery({
    enabled: open && credentialsReady,
    queryKey: queryKeys.key(
      'session-pages',
      settings.endpoint,
      'command-menu',
      connectionScope(settings),
      serverQuery,
    ),
    queryFn: async ({ signal }) =>
      (
        await repository.sessionPage(
          {
            kinds: PRIMARY_SESSION_KINDS,
            limit: serverQuery
              ? COMMAND_MENU_LIMITS.searchedSessions
              : COMMAND_MENU_LIMITS.recentSessions,
            search: serverQuery || undefined,
          },
          signal,
        )
      ).sessions,
  });
  const entitySessions = useLiveStore((state) => state.entities.sessions);
  const files = useQuery({
    // The `@`-picker excludes ONLY CLIO's own .clio/.clio-* service storage
    // (exclude_service_storage), independent of the Files-view-only "Hide dot
    // files and folders" toggle — an ordinary dotfile like .gitignore or
    // .github/workflows/ci.yml must stay @-mentionable, but referencing a
    // workspace's own agent state in a message is not what this picker is for.
    // The 4th key part spells out the exact param (not a bare boolean) so this
    // can never collide with the Files view's differently parameterized
    // include_hidden variant; the base ['workspace-files', endpoint,
    // workspaceId] prefix stays intact so it still gets invalidated on writes.
    queryKey: queryKeys.key(
      'workspace-files',
      settings.endpoint,
      workspaceId,
      'exclude_service_storage=true',
      connectionScope(settings),
    ),
    queryFn: ({ signal }) =>
      repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }),
    enabled: open && credentialsReady && !aiMode && Boolean(workspaceId),
  });
  const memory = useQuery({
    queryKey: queryKeys.key(
      'workspace-memory-search',
      settings.endpoint,
      'all-workspaces',
      connectionScope(settings),
      serverQuery,
    ),
    queryFn: ({ signal }) =>
      repository.searchMemory(
        serverQuery,
        { includeCrossSession: true, limit: COMMAND_MENU_LIMITS.memoryHits },
        signal,
      ),
    enabled: open && credentialsReady && !aiMode && serverQuery.length >= 2,
  });

  // 'command-palette' used to also be reachable via the native View menu
  // (removed, see menu_spec.rs's application-menu trim); the shared `search`
  // shortcut toggles the palette directly, so no useMenuAction is needed.
  useShortcut('search', () => changeOpen(!open), { overrideHandled: true });
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

  const normalizedQuery = searchText.trim().toLocaleLowerCase();
  const searchWorkspaceId = workspaceId || workspaces.data?.[0]?.id;
  const matchingFiles = useMemo(
    () =>
      normalizedQuery
        ? (files.data?.entries ?? [])
            .filter(
              (file) =>
                file.type === 'file' && file.path.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, COMMAND_MENU_LIMITS.files)
        : [],
    [files.data, normalizedQuery],
  );
  const matchingArtifacts = useMemo(
    () =>
      normalizedQuery
        ? Object.values(artifacts)
            .filter(
              (artifact) =>
                artifact.session_id === sessionId &&
                artifact.name.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, COMMAND_MENU_LIMITS.artifacts)
        : [],
    [artifacts, normalizedQuery, sessionId],
  );
  const workspaceNames = useMemo(
    () =>
      new Map((workspaces.data ?? []).map((workspace) => [workspace.id, workspace.display_name])),
    [workspaces.data],
  );
  const visibleSessions = useMemo(() => {
    const candidates = (sessions.data ?? []).filter(
      (session) =>
        !session.archived &&
        isPrimarySession(session) &&
        (normalizedQuery
          ? `${session.title} ${workspaceNames.get(session.workspace_id) ?? ''}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : session.id === sessionId ||
            session.pinned ||
            Date.parse(sessionInteractionAt(session)) >= recentThreshold),
    );
    return candidates
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
      )
      .slice(
        0,
        normalizedQuery ? COMMAND_MENU_LIMITS.searchedSessions : COMMAND_MENU_LIMITS.recentSessions,
      );
  }, [normalizedQuery, recentThreshold, sessionId, sessions.data, workspaceNames]);

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
  // The conversation to open in a workspace: the open one when it is there, else the
  // workspace's newest (one row from the server).
  const latestSessionIn = async (id: string) => {
    const current = entitySessions[sessionId];
    if (current?.workspace_id === id && !current.archived && isPrimarySession(current)) {
      return current;
    }
    const page = await repository.sessionPage({
      workspaceId: id,
      kinds: PRIMARY_SESSION_KINDS,
      limit: 1,
    });
    return page.sessions[0];
  };
  const openWorkspace = async (id: string) => {
    const latest = await latestSessionIn(id).catch(() => undefined);
    openRoute(
      latest
        ? `/workspaces/${encodeURIComponent(id)}/sessions/${encodeURIComponent(latest.id)}`
        : newConversationRoute(id),
    );
  };
  const openMemoryHit = async (hit: MemorySearchHit) => {
    const session =
      sessions.data?.find((candidate) => candidate.id === hit.session_id) ??
      entitySessions[hit.session_id] ??
      (hit.workspace_id
        ? undefined
        : (await repository.sessionsById([hit.session_id]).catch(() => []))[0]);
    const targetWorkspace = hit.workspace_id || session?.workspace_id;
    if (!targetWorkspace) return;
    openRoute(
      `/workspaces/${encodeURIComponent(targetWorkspace)}/sessions/${encodeURIComponent(hit.session_id)}${messageSearchHash(hit.message_id, hit.part_id ?? undefined, searchText.trim())}`,
    );
  };
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

  const searching = Boolean(normalizedQuery);
  const groupLimit = activeScope === 'all' ? ALL_SCOPE_GROUP_LIMIT : undefined;
  const memoryHits = serverQuery === searchText.trim() && !aiMode ? (memory.data?.hits ?? []) : [];
  const matchingWorkspaces = normalizedQuery
    ? (workspaces.data ?? [])
        .filter((item) =>
          `${item.display_name} ${item.name} ${item.path}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 20)
    : [];
  const pickScope = (next: CommandMenuScope) => {
    if (prefixScope) setQuery(withoutCommandMenuPrefix(query));
    setScope(next);
    searchInput.current?.focus();
  };
  const scopeCounts = (global: GlobalSearchMatches): Record<CommandMenuScope, number> => {
    const counts = {
      conversations: visibleSessions.length + memoryHits.length,
      files: matchingFiles.length,
      artifacts: matchingArtifacts.length,
      actions: global.counts.actions,
      settings: global.counts.settings,
      more: global.counts.more + matchingWorkspaces.length,
    };
    return { all: Object.values(counts).reduce((sum, count) => sum + count, 0), ...counts };
  };
  // Every result is a setting: Ctrl Enter opens Settings filtered to them.
  const settingsResultsRoute = (
    global: GlobalSearchMatches,
    counts: Record<CommandMenuScope, number>,
  ) => {
    if (!searching || !counts.all || counts.settings !== counts.all) return undefined;
    const first = global.commands.Settings[0]?.action;
    const route = first && 'route' in first ? first.route : '/settings/agents';
    return `${route}?q=${encodeURIComponent(searchText.trim())}`;
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>, settingsRoute?: string) => {
    if (event.nativeEvent.isComposing) return;
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === 'Tab' && !event.shiftKey && credentialsReady && searchWorkspaceId) {
      event.preventDefault();
      setAiMode(true);
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && settingsRoute) {
      event.preventDefault();
      openRoute(settingsRoute);
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
  const emptyText = (total: number) =>
    memory.isFetching
      ? 'Searching conversations…'
      : !searching && (activeScope === 'files' || activeScope === 'artifacts')
        ? `Type to find ${activeScope === 'files' ? 'a workspace file' : 'a session artifact'}.`
        : searching && activeScope !== 'all' && total
          ? `No ${scopeLabel.toLocaleLowerCase()} match. All has ${total} ${total === 1 ? 'result' : 'results'}.`
          : 'No matching work or action.';
  const sessionRows = capRows(visibleSessions, groupLimit);
  const messageRows = capRows(memoryHits, groupLimit);
  const fileRows = capRows(matchingFiles, groupLimit);
  const artifactRows = capRows(matchingArtifacts, groupLimit);
  const workspaceRows = capRows(matchingWorkspaces, groupLimit);

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className={`top-[10dvh] max-h-[80dvh] max-w-none translate-y-0 overflow-hidden p-0 sm:max-w-none ${aiMode ? 'w-[min(calc(100vw-1rem),max(30rem,60vw),48rem)]' : 'w-[min(calc(100vw-1rem),max(30rem,56vw),45rem)]'}`}
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
                const hints: PickerHint[] = [
                  { label: 'Close', shortcut: 'menu-close', optional: true },
                  activeScope !== 'all' && !searchText
                    ? { label: 'All types', shortcut: 'menu-all-types', optional: true }
                    : { label: 'Change type', shortcut: 'menu-type', optional: true },
                  { label: 'Open', shortcut: 'menu-pick' },
                  ...(settingsRoute
                    ? [
                        {
                          label: 'Open in Settings',
                          shortcut: 'menu-all-results',
                          onSelect: () => openRoute(settingsRoute),
                        },
                      ]
                    : []),
                  {
                    label: `Ask ${vocab.agent}`,
                    shortcut: 'menu-ask',
                    onSelect: () => setAiMode(true),
                    disabled: !credentialsReady || !searchWorkspaceId,
                  },
                ];
                return (
                  <>
                    <CommandInput
                      ref={searchInput}
                      autoFocus
                      className="min-w-0"
                      onValueChange={setQuery}
                      placeholder="Search work, files, artifacts, or actions…"
                      value={query}
                      trailing={
                        searching ? (
                          <span
                            aria-live="polite"
                            className="flex shrink-0 items-center gap-1.5 pr-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                          >
                            {memory.isFetching || files.isFetching ? (
                              <LoaderCircleIcon
                                aria-hidden="true"
                                className="size-3.5 motion-safe:animate-spin"
                              />
                            ) : null}
                            {counts.all} {counts.all === 1 ? 'result' : 'results'}
                          </span>
                        ) : null
                      }
                      onKeyDown={(event) => searchKeyDown(event, settingsRoute)}
                    />
                    <div className="border-b px-3">
                      <TextTabs
                        keepFocus
                        compact={compactTabs}
                        label="Result type"
                        onValueChange={pickScope}
                        tabs={COMMAND_MENU_SCOPES.map((tab) => ({
                          ...tab,
                          icon: compactTabs ? SCOPE_ICONS[tab.value] : undefined,
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
                    <CommandList className="max-h-[min(60dvh,34rem)]">
                      <CommandEmpty>{emptyText(counts.all)}</CommandEmpty>
                      {inCommandMenuScope(activeScope, 'conversations') &&
                      sessionRows.rows.length ? (
                        <CommandGroup
                          heading={
                            <ResultsHeading
                              count={searching ? visibleSessions.length : undefined}
                              label={searching ? 'Conversations' : 'Recent conversations'}
                            />
                          }
                        >
                          {sessionRows.rows.map((session) => (
                            <CommandItem
                              key={session.id}
                              onSelect={() =>
                                openRoute(
                                  `/workspaces/${session.workspace_id}/sessions/${session.id}`,
                                )
                              }
                              value={`session:${session.id}`}
                            >
                              <MessageSquareTextIcon aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">
                                <SearchHighlight text={session.title} query={searchText} />
                              </span>
                              <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                                <SearchHighlight
                                  text={
                                    workspaceNames.get(session.workspace_id) ??
                                    'Workspace unavailable'
                                  }
                                  query={searchText}
                                />
                              </span>
                              <ClioRelativeTime
                                compact
                                className="w-8 shrink-0 text-right text-xs tabular-nums"
                                timestamp={sessionInteractionAt(session)}
                              />
                            </CommandItem>
                          ))}
                          <MoreResultsItem
                            hidden={sessionRows.hidden}
                            noun="conversations"
                            onMore={pickScope}
                            scope="conversations"
                          />
                        </CommandGroup>
                      ) : null}
                      {inCommandMenuScope(activeScope, 'conversations') && memory.error ? (
                        <p role="alert" className="px-3 py-2 text-xs text-destructive">
                          Conversation search failed. {memory.error.message}
                        </p>
                      ) : null}
                      {inCommandMenuScope(activeScope, 'conversations') &&
                      messageRows.rows.length ? (
                        <CommandGroup
                          heading={
                            <ResultsHeading count={memoryHits.length} label="Matching messages" />
                          }
                        >
                          {messageRows.rows.map((hit) => (
                            <CommandItem
                              key={`${hit.session_id}:${hit.message_id}:${hit.part_id ?? ''}`}
                              onSelect={() => void openMemoryHit(hit)}
                              value={`message:${hit.session_id}:${hit.message_id}:${hit.part_id ?? ''}`}
                              className="items-start py-2"
                            >
                              <MessageSquareTextIcon aria-hidden="true" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  <SearchHighlight
                                    text={hit.session_title || 'Untitled session'}
                                    query={searchText}
                                  />
                                </span>
                                <span className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                                  <SearchHighlight
                                    text={projectText(hit.text, { source: true }).text}
                                    query={searchText}
                                    partial
                                  />
                                </span>
                                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                                  {workspaceNames.get(hit.workspace_id) ?? hit.workspace_id} → Open
                                  matching passage
                                </span>
                              </span>
                              <CommandShortcut>{roleLabel(hit.role)}</CommandShortcut>
                            </CommandItem>
                          ))}
                          <MoreResultsItem
                            hidden={messageRows.hidden}
                            noun="messages"
                            onMore={pickScope}
                            scope="conversations"
                          />
                        </CommandGroup>
                      ) : null}
                      {inCommandMenuScope(activeScope, 'files') && fileRows.rows.length ? (
                        <CommandGroup
                          heading={<ResultsHeading count={matchingFiles.length} label="Files" />}
                        >
                          {fileRows.rows.map((file) => (
                            <CommandItem
                              key={file.path}
                              onSelect={() =>
                                void openResource({ kind: 'workspace-file', path: file.path })
                              }
                              value={file.path}
                            >
                              <FileIcon aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">
                                <SearchHighlight text={file.path} query={searchText} />
                              </span>
                            </CommandItem>
                          ))}
                          <MoreResultsItem
                            hidden={fileRows.hidden}
                            noun="files"
                            onMore={pickScope}
                            scope="files"
                          />
                        </CommandGroup>
                      ) : null}
                      {inCommandMenuScope(activeScope, 'artifacts') && artifactRows.rows.length ? (
                        <CommandGroup
                          heading={
                            <ResultsHeading count={matchingArtifacts.length} label="Artifacts" />
                          }
                        >
                          {artifactRows.rows.map((artifact: Artifact) => (
                            <CommandItem
                              key={artifact.id}
                              onSelect={() => void openResource({ kind: 'artifact', artifact })}
                              value={`artifact:${artifact.id}`}
                            >
                              <BoxIcon aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">
                                <SearchHighlight text={artifact.name} query={searchText} />
                              </span>
                              <CommandShortcut>{artifact.media_type}</CommandShortcut>
                            </CommandItem>
                          ))}
                          <MoreResultsItem
                            hidden={artifactRows.hidden}
                            noun="artifacts"
                            onMore={pickScope}
                            scope="artifacts"
                          />
                        </CommandGroup>
                      ) : null}
                      <GlobalSearchGroups
                        limit={groupLimit}
                        matches={global}
                        onFinish={() => finish(() => {})}
                        onMore={pickScope}
                        onRoute={openRoute}
                        query={searchText}
                        scope={activeScope}
                        searching={searching}
                        after={
                          inCommandMenuScope(activeScope, 'more') && workspaceRows.rows.length ? (
                            <CommandGroup
                              heading={
                                <ResultsHeading
                                  count={matchingWorkspaces.length}
                                  label="Workspaces"
                                />
                              }
                            >
                              {workspaceRows.rows.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={`workspace:${item.id}`}
                                  onSelect={() => void openWorkspace(item.id)}
                                >
                                  <FolderIcon aria-hidden="true" />
                                  <span className="min-w-0 flex-1 truncate">
                                    <SearchHighlight text={item.display_name} query={searchText} />
                                  </span>
                                  <CommandShortcut>Workspace</CommandShortcut>
                                </CommandItem>
                              ))}
                              <MoreResultsItem
                                hidden={workspaceRows.hidden}
                                noun="workspaces"
                                onMore={pickScope}
                                scope="more"
                              />
                            </CommandGroup>
                          ) : null
                        }
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

const SCOPE_ICONS: Record<CommandMenuScope, ReactNode> = {
  all: <LayersIcon aria-hidden="true" />,
  conversations: <MessageSquareTextIcon aria-hidden="true" />,
  files: <FileIcon aria-hidden="true" />,
  artifacts: <BoxIcon aria-hidden="true" />,
  actions: <ZapIcon aria-hidden="true" />,
  settings: <SettingsIcon aria-hidden="true" />,
  more: <MoreIcon aria-hidden="true" />,
};

function roleLabel(role: MemorySearchHit['role']): string {
  if (role === 'assistant') return brand.name;
  if (role === 'user') return 'You';
  return role === 'tool' ? 'Tool' : 'System';
}
