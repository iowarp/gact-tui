import { workspaceName } from '@/lib/workspace-labels';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SourceProvider } from '@clio/core/v3';
import { FolderIcon, LinkIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SettingsSelectField } from './model-select-field';
import type { ObsidianChoice } from './obsidian-source-form';
import { DialogFrame } from './primitives/dialog-frame';
import { SettingsRow } from './settings-row';
import { t, ph } from '@lingui/core/macro';

/** Settings actions explicitly choose a workspace before opening its shared source form. */
export function SettingsSourceConnect({
  provider,
  choice,
  onClose,
}: {
  provider: SourceProvider;
  choice?: ObsidianChoice;
  onClose: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const navigate = useNavigate();
  const id = useId();
  const [workspaceId, setWorkspaceId] = useState('');
  const workspaces = useQuery({
    queryKey: ['source-settings-workspaces', scope],
    queryFn: ({ signal }) => repository.workspaces(signal),
    retry: false,
  });
  const selected =
    workspaces.data?.find((row) => row.id === workspaceId) ??
    (workspaces.data?.length === 1 ? workspaces.data[0] : undefined);
  const proceed = () => {
    if (!selected) return;
    void navigate(newConversationRoute(selected.id), {
      state: { sourceConnection: { scope, providerId: provider.id, choice } },
    });
  };
  return (
    <DialogFrame
      confirm={{ label: t`Continue`, onConfirm: proceed, disabled: !selected }}
      icon={<LinkIcon className="size-3.5" />}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={choice === 'new' ? t`New vault` : t`Connect ${ph({ name: provider.name })}`}
    >
      <SettingsRow
        error={workspaces.error ? t`Workspaces couldn’t be loaded.` : undefined}
        htmlFor={`${id}-workspace`}
        info={t`The source is added to this workspace. You review its access in the next step.`}
        note={
          workspaces.isSuccess && !workspaces.data.length
            ? t`Create a workspace first, then connect its data here.`
            : undefined
        }
        title={t`Workspace`}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild disabled={!workspaces.data?.length}>
            <SettingsSelectField
              aria-label={
                selected
                  ? t`Workspace: ${ph({ workspace: workspaceName(selected) })}`
                  : t`Workspace: none chosen`
              }
              data-initial-focus=""
              icon={<FolderIcon />}
              id={`${id}-workspace`}
              placeholder={workspaces.isPending ? t`Loading workspaces…` : t`Choose a workspace`}
              value={selected ? workspaceName(selected) : undefined}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
          >
            <DropdownMenuRadioGroup onValueChange={setWorkspaceId} value={selected?.id ?? ''}>
              {workspaces.data?.map((row) => (
                <DropdownMenuRadioItem key={row.id} value={row.id}>
                  {workspaceName(row)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingsRow>
    </DialogFrame>
  );
}
