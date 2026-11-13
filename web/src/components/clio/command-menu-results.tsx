import { workspaceName, workspaceSearchName } from '@/lib/workspace-labels';
import type { Artifact, MemorySearchHit } from '@clio/core/v3';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { BoxIcon, FileIcon, LayersIcon, MessageSquareTextIcon, ZapIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import type { CommandMenuScope } from '@/lib/command-menu-scopes';
import { connectionScope } from '@/lib/connection-scope';
import { MoreIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import {
  isPrimarySession,
  PRIMARY_SESSION_KINDS,
  sessionInteractionAt,
} from '@/lib/recent-sessions';
import { messageSearchHash } from '@/lib/search-matches';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { retryUnlessMissing, type GlobalSearchMatches } from './use-global-search-matches';

/** How many results each group fetches or keeps. Unit: entries per group. */
export interface CommandMenuLimits {
  /** Names the session and memory pages, which the server cuts to these limits. */
  key: string;
  /** Workspace files matching the typed query. */
  files: number;
  /** Session artifacts matching the typed query. */
  artifacts: number;
  /** Remembered-context hits fetched from the backend per query. */
  memoryHits: number;
  /** Sessions shown while searching, where the query already narrows them. */
  searchedSessions: number;
  /** Sessions shown on open, before anything is typed. */
  recentSessions: number;
}

/**
 * The palette is a keyboard jump list, so every group has to stay scannable
 * without scrolling; raise a value only if a group routinely hides the entry
 * people are reaching for.
 */
export const COMMAND_MENU_LIMITS: CommandMenuLimits = {
  key: 'command-menu',
  files: 16,
  artifacts: 12,
  memoryHits: 12,
  searchedSessions: 20,
  recentSessions: 10,
};

/** The All results tab is for reading a long list, so it keeps more of each. */
export const ALL_RESULTS_LIMITS: CommandMenuLimits = {
  key: 'all-results',
  files: 200,
  artifacts: 100,
  memoryHits: 50,
  searchedSessions: 50,
  recentSessions: 10,
};

/**
 * The work results of a search (conversations, passages, files, artifacts,
 * workspaces), shared by the Ctrl K palette and the All results tab so both
 * list the same rows.
 */
export function useCommandMenuResults({
  enabled,
  local,
  searchText,
  serverQuery,
  workspaceId,
  sessionId,
  limits,
}: {
  /** Whether to read at all (the palette is open, credentials are ready). */
  enabled: boolean;
  /** Whether to read files and passages (off while the search assistant answers). */
  local: boolean;
  searchText: string;
  /** The debounced query the server pages are read for. */
  serverQuery: string;
  workspaceId: string;
  sessionId: string;
  limits: CommandMenuLimits;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const artifacts = useLiveStore((state) => state.entities.artifacts);
  const queryClient = useQueryClient();
  // The All results tab opens on the palette's pages while it reads its longer ones,
  // so the moved list shows at once instead of filling in.
  const fromPalette =
    limits.key === COMMAND_MENU_LIMITS.key
      ? undefined
      : <T,>(key: QueryKey) =>
          () =>
            queryClient.getQueryData<T>(key);
  const workspaces = useQuery({
    enabled,
    queryKey: queryKeys.key('workspaces', settings.endpoint, scope),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  // One page from the server: the newest conversations, or the titles matching the
  // (debounced) query. The menu never loads every session.
  const sessions = useQuery({
    enabled,
    queryKey: queryKeys.key('session-pages', settings.endpoint, limits.key, scope, serverQuery),
    queryFn: async ({ signal }) =>
      (
        await repository.sessionPage(
          {
            kinds: PRIMARY_SESSION_KINDS,
            limit: serverQuery ? limits.searchedSessions : limits.recentSessions,
            search: serverQuery || undefined,
          },
          signal,
        )
      ).sessions,
    placeholderData: fromPalette?.(
      queryKeys.key(
        'session-pages',
        settings.endpoint,
        COMMAND_MENU_LIMITS.key,
        scope,
        serverQuery,
      ),
    ),
  });
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
      scope,
    ),
    queryFn: ({ signal }) =>
      repository.workspaceFiles(workspaceId, signal, { excludeServiceStorage: true }),
    enabled: enabled && local && Boolean(workspaceId),
  });
  const memory = useQuery({
    queryKey: queryKeys.key(
      'workspace-memory-search',
      settings.endpoint,
      'all-workspaces',
      scope,
      serverQuery,
      limits.memoryHits,
    ),
    queryFn: ({ signal }) =>
      repository.searchMemory(
        serverQuery,
        { includeCrossSession: true, limit: limits.memoryHits },
        signal,
      ),
    enabled: enabled && local && serverQuery.length >= 2,
    retry: retryUnlessMissing,
    placeholderData: fromPalette?.(
      queryKeys.key(
        'workspace-memory-search',
        settings.endpoint,
        'all-workspaces',
        scope,
        serverQuery,
        COMMAND_MENU_LIMITS.memoryHits,
      ),
    ),
  });

  const normalizedQuery = searchText.trim().toLocaleLowerCase();
  const matchingFiles = useMemo(
    () =>
      normalizedQuery
        ? (files.data?.entries ?? [])
            .filter(
              (file) =>
                file.type === 'file' && file.path.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, limits.files)
        : [],
    [files.data, limits.files, normalizedQuery],
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
            .slice(0, limits.artifacts)
        : [],
    [artifacts, limits.artifacts, normalizedQuery, sessionId],
  );
  const workspaceNames = useMemo(
    () =>
      new Map((workspaces.data ?? []).map((workspace) => [workspace.id, workspaceName(workspace)])),
    [workspaces.data],
  );
  const workspaceSearchNames = useMemo(
    () =>
      new Map(
        (workspaces.data ?? []).map((workspace) => [workspace.id, workspaceSearchName(workspace)]),
      ),
    [workspaces.data],
  );
  const visibleSessions = useMemo(() => {
    const candidates = (sessions.data ?? []).filter(
      (session) =>
        !session.archived &&
        isPrimarySession(session) &&
        (normalizedQuery
          ? `${session.title} ${workspaceSearchNames.get(session.workspace_id) ?? ''}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : true),
    );
    return candidates
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
      )
      .slice(0, normalizedQuery ? limits.searchedSessions : limits.recentSessions);
  }, [
    limits.recentSessions,
    limits.searchedSessions,
    normalizedQuery,
    sessions.data,
    workspaceSearchNames,
  ]);
  const memoryHits = serverQuery === searchText.trim() && local ? (memory.data?.hits ?? []) : [];
  const matchingWorkspaces = normalizedQuery
    ? (workspaces.data ?? [])
        .filter((item) =>
          `${workspaceSearchName(item)} ${item.display_name} ${item.name} ${item.path}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 20)
    : [];
  return {
    searching: Boolean(normalizedQuery),
    workspaces,
    sessions,
    files,
    memory,
    workspaceNames,
    visibleSessions,
    memoryHits,
    matchingFiles,
    matchingArtifacts,
    matchingWorkspaces,
    fetching: memory.isFetching || files.isFetching,
  };
}

export type CommandMenuResults = ReturnType<typeof useCommandMenuResults>;

/** Results per type tab; `all` sums them. */
export function commandMenuCounts(
  results: CommandMenuResults,
  global: GlobalSearchMatches,
): Record<CommandMenuScope, number> {
  const counts = {
    conversations: results.visibleSessions.length + results.memoryHits.length,
    files: results.matchingFiles.length,
    artifacts: results.matchingArtifacts.length,
    actions: global.counts.actions,
    settings: global.counts.settings,
    more: global.counts.more + results.matchingWorkspaces.length,
  };
  return { all: Object.values(counts).reduce((sum, count) => sum + count, 0), ...counts };
}

/**
 * Opening a workspace or a remembered passage: both look up the conversation
 * to land in, then hand its route to `openRoute`.
 */
export function useCommandMenuOpeners({
  results,
  sessionId,
  searchText,
  openRoute,
}: {
  results: CommandMenuResults;
  sessionId: string;
  searchText: string;
  openRoute: (path: string) => void;
}) {
  const repository = useRepository();
  const entitySessions = useLiveStore((state) => state.entities.sessions);
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
      results.sessions.data?.find((candidate) => candidate.id === hit.session_id) ??
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
  return { latestSessionIn, openWorkspace, openMemoryHit };
}

export type CommandMenuResource =
  | { kind: 'workspace-file'; path: string }
  | { kind: 'artifact'; artifact: Artifact };

/** Each type tab's icon, for tab strips too narrow for words. */
export const COMMAND_MENU_SCOPE_ICONS: Record<CommandMenuScope, ReactNode> = {
  all: <LayersIcon aria-hidden="true" />,
  conversations: <MessageSquareTextIcon aria-hidden="true" />,
  files: <FileIcon aria-hidden="true" />,
  artifacts: <BoxIcon aria-hidden="true" />,
  actions: <ZapIcon aria-hidden="true" />,
  settings: <SettingsIcon aria-hidden="true" />,
  more: <MoreIcon aria-hidden="true" />,
};
