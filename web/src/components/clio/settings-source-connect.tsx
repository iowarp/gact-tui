import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SourceProvider } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { DialogFrame } from './primitives/dialog-frame';
import { StateView } from './primitives/state-view';
import { SettingsLoadError } from './settings-health-load-error';
import { SettingsRow } from './settings-row';
import { SourceProviderLogo } from './source-provider-logo';
import type { ObsidianChoice } from './obsidian-source-form';

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
  const [workspaceId, setWorkspaceId] = useState('');
  const workspaces = useQuery({
    queryKey: ['source-settings-workspaces', scope],
    queryFn: ({ signal }) => repository.workspaces(signal),
    retry: false,
  });
  const selected =
    workspaces.data?.find((row) => row.id === workspaceId) ??
    (workspaces.data?.length === 1 ? workspaces.data[0] : undefined);
  return (
    <DialogFrame
      confirm={{
        label: 'Continue',
        disabled: !selected,
        onConfirm: () => {
          if (!selected) return;
          void navigate(newConversationRoute(selected.id), {
            state: { sourceConnection: { scope, providerId: provider.id, choice } },
          });
        },
      }}
      description="Choose the workspace for this source. Review access in the next step."
      icon={<SourceProviderLogo provider={provider.id} />}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={choice === 'new' ? 'New vault' : `Connect ${provider.name}`}
    >
      <SettingsRow htmlFor="source-workspace" title="Workspace">
        <select
          className="h-[1.875rem] w-full min-w-0 rounded-md border border-input bg-input/30 px-2 text-[0.78125rem] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          data-initial-focus=""
          id="source-workspace"
          onChange={(event) => setWorkspaceId(event.target.value)}
          title={selected?.display_name}
          value={selected?.id ?? ''}
        >
          <option value="">
            {workspaces.isPending ? 'Loading workspaces…' : 'Choose a workspace'}
          </option>
          {workspaces.data?.map((row) => (
            <option key={row.id} value={row.id}>
              {row.display_name}
            </option>
          ))}
        </select>
      </SettingsRow>
      {workspaces.error ? (
        <SettingsLoadError
          error={workspaces.error}
          onRetry={() => void workspaces.refetch()}
          retrying={workspaces.isFetching}
          title="Workspaces unavailable."
        />
      ) : null}
      {workspaces.isSuccess && !workspaces.data.length ? (
        <StateView
          kind="empty"
          size="row"
          title="Create a workspace first, then connect its data here."
        />
      ) : null}
    </DialogFrame>
  );
}
