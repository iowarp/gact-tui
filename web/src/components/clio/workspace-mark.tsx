import { MessageSquareIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-labels';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useWorkspaceAppearance, workspaceColour, workspaceIcon } from './settings-folders-model';

/**
 * A workspace's mark: the icon and colour chosen on its Folders page, or the
 * ones derived from its id until someone picks them.
 */
export function WorkspaceMark({ id, className }: { id: string; className?: string }) {
  const { settings } = useConnectionSettings();
  const { appearance } = useWorkspaceAppearance(settings.endpoint, id);
  const { Icon } = workspaceIcon(appearance.icon);
  return (
    <Icon
      aria-hidden="true"
      className={cn('size-4 shrink-0', workspaceColour(appearance.colour).text, className)}
    />
  );
}

/** The top bar's crumb icon: a chat bubble for Conversations, otherwise the workspace's mark. */
export function WorkspaceCrumbMark({ id }: { id: string }) {
  return id === DEFAULT_WORKSPACE_ID ? (
    <MessageSquareIcon aria-hidden="true" className="size-4 shrink-0" />
  ) : (
    <WorkspaceMark id={id} />
  );
}