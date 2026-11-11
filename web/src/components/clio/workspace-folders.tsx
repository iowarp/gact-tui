import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderIcon, FolderLockIcon } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { QUERY_STALE_TIME_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';

const isWithin = (folder: string, root: string) => {
  const clean = (path: string) => path.replace(/[\\/]+$/u, '');
  const [a, b] = [clean(folder), clean(root)];
  return a === b || a.startsWith(`${b}/`) || a.startsWith(`${b}\\`);
};

/**
 * The folders CLIO may write in a workspace: its own folder and the ones the person
 * allowed (the workspace record's `source_folders`), and a way to refresh them after
 * a grant.
 */
// oxlint-disable-next-line react/only-export-components
export function useWorkspaceFolders(workspaceId: string | undefined) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const key = queryKeys.key('workspaces', settings.endpoint);
  const workspaces = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.workspaces(signal),
    enabled: Boolean(workspaceId),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const folders: WorkspaceSourceFolder[] = workspace?.source_folders ?? [];
  const allowed = folders.filter((folder) => !folder.primary);
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key],
  );
  return {
    workspace,
    primary: folders.find((folder) => folder.primary),
    allowed,
    /** Whether `folder` is already writable through a folder the person allowed. */
    isAllowed: (folder: string) => allowed.some((item) => isWithin(folder, item.path)),
    refresh,
  };
}

function FolderRow({ folder, note }: { folder: WorkspaceSourceFolder; note: string }) {
  const Icon = folder.primary ? FolderIcon : FolderLockIcon;
  return (
    <li>
      <Button
        aria-label={`${folder.name}, ${note}. Copy ${folder.path}`}
        className="h-7 w-full min-w-0 justify-start gap-2 px-1.5 text-xs font-normal"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(folder.path)
            .then(() => toast.success('Folder path copied', { description: folder.path }));
        }}
        title={folder.path}
        variant="ghost"
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{folder.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">{note}</span>
      </Button>
    </li>
  );
}

/**
 * The folders this conversation's commands may write beyond the workspace folder, like
 * the sources it used: shown only when the person has allowed any. Hover names the
 * path; clicking copies it.
 */
export function WorkspaceFoldersBar({ folders }: { folders?: readonly WorkspaceSourceFolder[] }) {
  const primary = folders?.find((folder) => folder.primary);
  const allowed = folders?.filter((folder) => !folder.primary) ?? [];
  if (!allowed.length) return null;
  return (
    <section aria-label="Folders the agent may write" className="grid gap-1 border-b pb-2">
      <p className="flex items-center gap-2 text-xs font-medium">
        <FolderLockIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        Folders the agent may write
      </p>
      <ul className="grid gap-0.5">
        {primary ? <FolderRow folder={primary} note="Workspace folder" /> : null}
        {allowed.map((folder) => (
          <FolderRow folder={folder} key={folder.path} note="Allowed by you" />
        ))}
      </ul>
    </section>
  );
}
