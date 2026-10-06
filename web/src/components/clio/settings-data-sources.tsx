import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSectionHeading } from './settings-section-heading';
import { ConnectedSourceContents } from './connected-source-picker';

/** Accounts belong to this CLIO; saved datasets belong to the selected workspace. */
export function DataSourceSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [preference, setPreference] = useState('');
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', scope, 'data-source-settings'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const requested = preference || initialWorkspaceId;
  const workspaceId =
    workspaces.data?.find((row) => row.id === requested)?.id || workspaces.data?.[0]?.id || '';
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        title="Data sources"
        description={`Sign in to provider accounts and manage the data connected to a workspace. Accounts are shared across workspaces on this ${vocab.agent}; sources belong to the workspace you choose.`}
      />
      {workspaces.error ? <p role="alert">{workspaces.error.message}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-56 gap-2">
          <Label htmlFor="source-settings-workspace">Workspace</Label>
          <Select value={workspaceId} onValueChange={setPreference} disabled={!workspaceId}>
            <SelectTrigger id="source-settings-workspace" aria-label="Workspace">
              <SelectValue placeholder="Choose a workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.data?.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.display_name || row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div ref={setHeaderActions} className="flex items-center gap-1" />
      </div>
      {!workspaces.isPending && !workspaces.error && !workspaceId ? (
        <p>Register a workspace to connect a dataset. You can sign in to accounts here first.</p>
      ) : null}
      {workspaces.isPending ? (
        <p role="status">Loading workspaces…</p>
      ) : (
        <ConnectedSourceContents
          key={`${scope}:${workspaceId}`}
          workspaceId={workspaceId}
          manageOnly={false}
          settingsView
          headerActions={headerActions}
          onDiscard={() => undefined}
        />
      )}
    </div>
  );
}
