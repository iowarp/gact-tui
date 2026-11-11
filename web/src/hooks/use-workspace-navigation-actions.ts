import { queryKeys } from '@/lib/query-keys';
import { loadSessionReviewRenderer } from '@/lib/session-export/renderer-assets';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { useAvailableSessionNavigation } from '@/hooks/use-available-session-navigation';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { toast } from 'sonner';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  closeEmbeddedTerminalsForSession,
  openWorkspaceTerminal,
} from '@/tauri/workspace-terminal';
import { useLiveStore } from '@/store/live-store';
import { movedFromWorkspace, sessionMoveFailure } from '@/lib/session-move';

/**
 * The workspace/session CRUD surface for navigation-owning components (command
 * menu, sidebar): create, rename, pin, archive, delete, export/import, plus
 * the query-invalidation refresh every mutation needs afterward.
 */
export function useWorkspaceNavigationActions(workspaceId: string, sessionId: string) {
  const navigate = useNavigate();
  const navigateToAvailableSession = useAvailableSessionNavigation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();

  const refreshNavigation = useCallback(
    async (targetWorkspaceId = workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('workspaces', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, targetWorkspaceId),
        }),
        // The open session's family, which the sidebar shows: the live stream
        // does not report renames or pins.
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, 'family'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('session-pages', settings.endpoint),
        }),
      ]);
    },
    [queryClient, settings.endpoint, workspaceId],
  );

  const updateSessionIdentity = useCallback(
    async (id: string, patch: { title?: string; pinned?: boolean }) => {
      const updated = await repository.updateSession(id, patch);
      // A live session owns its streamed row, so a list refetch alone cannot
      // update its name/pin. Apply only acknowledged identity fields; retain
      // any newer work state and other fields delivered while the request ran.
      useLiveStore.setState((state) => {
        const current = state.entities.sessions[id];
        if (!current) return state;
        return {
          entities: {
            ...state.entities,
            sessions: {
              ...state.entities.sessions,
              [id]: {
                ...current,
                ...(patch.title !== undefined ? { title: updated.title } : {}),
                ...(patch.pinned !== undefined ? { pinned: updated.pinned } : {}),
              },
            },
          },
        };
      });
    },
    [repository],
  );

  const refreshTranscript = useCallback(
    async (targetSessionId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('transcript', settings.endpoint, targetSessionId),
        }),
        refreshNavigation(),
      ]);
    },
    [queryClient, refreshNavigation, settings.endpoint],
  );

  const refreshWorkspaceFolders = useCallback(
    async (targetWorkspaceId: string) => {
      await Promise.all([
        refreshNavigation(targetWorkspaceId),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            queryKey.includes(settings.endpoint) &&
            queryKey.includes(targetWorkspaceId) &&
            typeof queryKey[0] === 'string' &&
            queryKey[0].startsWith('workspace-'),
        }),
      ]);
    },
    [queryClient, refreshNavigation, settings.endpoint],
  );

  const navigationActions = useMemo<ResourceActions>(
    () => ({
      createWorkspace: async ({ name, rootPath }) => {
        await repository.createWorkspace({ name, root_path: rootPath });
        await refreshNavigation();
      },
      renameWorkspace: async (targetWorkspaceId, name) => {
        await repository.updateWorkspace(targetWorkspaceId, { name });
        await refreshNavigation(targetWorkspaceId);
      },
      updateWorkspace: async (targetWorkspaceId, input) => {
        await repository.updateWorkspace(targetWorkspaceId, input);
        await refreshWorkspaceFolders(targetWorkspaceId);
      },
      grantWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.grantWorkspaceFolder(targetWorkspaceId, path);
        await refreshWorkspaceFolders(targetWorkspaceId);
      },
      revokeWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.revokeWorkspaceFolder(targetWorkspaceId, path);
        await refreshWorkspaceFolders(targetWorkspaceId);
      },
      workspaceMemory: (targetWorkspaceId) => repository.workspaceMemory(targetWorkspaceId),
      setWorkspaceMemory: async (targetWorkspaceId, useAccountMemory) => {
        await repository.setWorkspaceMemory(targetWorkspaceId, useAccountMemory);
      },
      renameSession: async (targetSessionId, title) => {
        await updateSessionIdentity(targetSessionId, { title });
        await refreshNavigation();
      },
      setWorkspacePinned: async (targetWorkspaceId, pinned) => {
        await repository.updateWorkspace(targetWorkspaceId, { pinned });
        await refreshNavigation(targetWorkspaceId);
      },
      setSessionPinned: async (targetSessionId, pinned) => {
        await updateSessionIdentity(targetSessionId, { pinned });
        await refreshNavigation();
      },
      archiveSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: true });
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      forkSession: async (targetSessionId) => {
        const forked = await repository.forkSession(targetSessionId, {});
        await refreshNavigation(forked.workspace_id);
        await navigate(
          `/workspaces/${encodeURIComponent(forked.workspace_id)}/sessions/${encodeURIComponent(forked.id)}`,
        );
      },
      moveSession: async (targetSessionId, targetWorkspaceId) => {
        const previous = useLiveStore.getState().entities.sessions[targetSessionId]?.workspace_id;
        const moved = await repository
          .moveSession(targetSessionId, targetWorkspaceId)
          .catch((error: unknown) => {
            throw sessionMoveFailure(error);
          });
        useLiveStore.setState((state) => {
          const current = state.entities.sessions[targetSessionId];
          if (!current) return state;
          return {
            entities: {
              ...state.entities,
              sessions: {
                ...state.entities.sessions,
                [targetSessionId]: { ...current, workspace_id: moved.workspace_id },
              },
            },
          };
        });
        const from = movedFromWorkspace(moved) ?? previous ?? workspaceId;
        await Promise.all([refreshNavigation(from), refreshNavigation(moved.workspace_id)]);
        if (targetSessionId === sessionId && moved.workspace_id !== workspaceId) {
          await navigate(
            `/workspaces/${encodeURIComponent(moved.workspace_id)}/sessions/${encodeURIComponent(moved.id)}`,
            { replace: true },
          );
        }
      },
      shareSession: async (targetSessionId, ttlSeconds) => {
        const shared = await repository.shareSession(targetSessionId, ttlSeconds);
        return new URL(shared.url, settings.endpoint).toString();
      },
      compactSession: async (targetSessionId) => {
        const result = await repository.compactSession(targetSessionId);
        await refreshTranscript(targetSessionId);
        if (result.compacted) toast.success('Conversation compacted');
        else
          toast.info('Conversation was not compacted', {
            description: result.reason ?? 'The service did not report a reason.',
          });
      },
      undoSession: async (targetSessionId) => {
        const result = await repository.undoSession(targetSessionId);
        await refreshTranscript(targetSessionId);
        toast.success(
          result.deleted_message_ids.length === 1
            ? 'Last message removed'
            : `${result.deleted_message_ids.length} messages removed`,
        );
      },
      openSystemTerminal: inTauri()
        ? async (workspacePath) => {
            try {
              await openWorkspaceTerminal(workspacePath);
            } catch (error) {
              toast.error('Could not open the workspace terminal', {
                description:
                  error instanceof Error
                    ? error.message
                    : 'No supported terminal could be started.',
              });
            }
          }
        : undefined,
      restoreSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: false });
        await refreshNavigation();
      },
      deleteWorkspace: async (targetWorkspaceId) => {
        await repository.deleteWorkspace(targetWorkspaceId);
        if (targetWorkspaceId === workspaceId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation(targetWorkspaceId);
      },
      deleteSession: async (targetSessionId) => {
        // Best-effort: an embedded terminal opened under this session must
        // not outlive it, even if its workbench tab was never explicitly
        // closed. Never blocks the actual delete on pty teardown.
        await closeEmbeddedTerminalsForSession(targetSessionId).catch(() => undefined);
        await repository.deleteSession(targetSessionId);
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      exportSession: async (targetSessionId, mode) =>
        repository.prepareSessionArchive(targetSessionId, mode, await loadSessionReviewRenderer()),
      importSession: async (value) => {
        const imported = await repository.importSession(value);
        await refreshNavigation(imported.workspace_id);
        await navigate(
          `/workspaces/${encodeURIComponent(imported.workspace_id)}/sessions/${encodeURIComponent(imported.id)}`,
        );
      },
    }),
    [
      navigate,
      navigateToAvailableSession,
      refreshNavigation,
      refreshTranscript,
      refreshWorkspaceFolders,
      repository,
      sessionId,
      settings.endpoint,
      workspaceId,
      updateSessionIdentity,
    ],
  );

  return { navigationActions, refreshNavigation };
}
