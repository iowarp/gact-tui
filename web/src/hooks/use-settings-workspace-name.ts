import { workspaceName } from '@/lib/workspace-labels';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { workspaceScopeLine } from '@/lib/settings-workspace-name';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { t } from '@lingui/core/macro';

export interface SettingsWorkspaceName {
  /** The workspace's name, or neutral words while it loads or when there is none. */
  label: string;
  /** The Workspace scope line for that name. */
  line: string;
  /** False until the name is known. */
  known: boolean;
}

/**
 * Names the workspace the Settings window's Workspace sections apply to: the one behind the
 * window, or, when it opened on its own, the first workspace (the one those sections show).
 * Reads the shared workspaces list, so it never shows a generic placeholder as a name.
 */
export function useSettingsWorkspaceName(workspaceId: string | undefined): SettingsWorkspaceName {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const live = useLiveStore((state) =>
    workspaceId ? state.entities.workspaces[workspaceId] : undefined,
  );
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const listed = workspaceId
    ? workspaces.data?.find((item) => item.id === workspaceId)
    : workspaces.data?.[0];
  const entry = live?.display_name || live?.name ? live : listed;
  const name = entry ? workspaceName(entry) : undefined;
  if (name) return { label: name, line: workspaceScopeLine(name), known: true };
  // The Workspace group keeps its own name until the workspace's name arrives; the
  // page's own lists show the loading state.
  if (workspaces.isPending)
    return { label: t`Workspace`, line: t`Loading this workspace…`, known: false };
  if (workspaces.isError || workspaceId)
    return {
      label: t`This workspace`,
      line: workspaces.isError
        ? t`This workspace’s name could not be loaded`
        : t`This workspace is no longer available`,
      known: false,
    };
  return { label: t`No workspace yet`, line: t`No workspace yet`, known: false };
}
