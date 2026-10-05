import { useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { DatabaseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { PresentationNavigation } from './presentation-navigation';
import { ConnectedSourcePicker } from './connected-source-picker';
import { InfoTip } from './info-tip';

/** A tool may offer setup; only a user opens this private, owner-checked surface. */
export function ConnectedDataSetupLink({ block }: { block: ToolPresentationBlock }) {
  const navigation = useContext(PresentationNavigation);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [openedScope, setOpenedScope] = useState<string>();
  const workspaceId = block.workspace_id;
  const sameWorkspace = Boolean(workspaceId && workspaceId === navigation?.workspaceId);
  const open = openedScope === scope && sameWorkspace;
  const owner = useQuery({
    queryKey: ['connected-data-setup-owner', scope, workspaceId, block.uri],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    enabled: open,
    retry: false,
    staleTime: 0,
  });
  const matches = owner.data?.clio_id === block.uri && Boolean(block.uri);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!sameWorkspace || (open && owner.isFetching)}
          onClick={() => {
            setOpenedScope(scope);
            if (open) void owner.refetch();
          }}
        >
          <DatabaseIcon aria-hidden="true" className="size-4" />
          Connect data
        </Button>
        <InfoTip label="About private data setup">
          Sign-in runs privately in your browser, outside the agent conversation. The agent receives
          only status and the data references you approve. Paths belong to the connected{' '}
          {vocab.agent}.
        </InfoTip>
      </div>
      {!sameWorkspace && (
        <p className="text-xs text-muted-foreground">
          Open the original workspace to connect its data.
        </p>
      )}
      {open && owner.isFetching && (
        <p role="status" className="text-xs">
          Checking the connected {vocab.agent}…
        </p>
      )}
      {open && !owner.isFetching && (owner.error || !matches) && (
        <p role="alert" className="text-sm text-destructive">
          {owner.error
            ? 'Could not check this connection. Retry Connect data.'
            : `This setup belongs to a different ${vocab.agent}. Reconnect to the original host.`}
        </p>
      )}
      {open && matches && !owner.isFetching && workspaceId && (
        <ConnectedSourcePicker
          key={`${scope}:${workspaceId}`}
          workspaceId={workspaceId}
          open
          onOpenChange={(next) => {
            if (!next) setOpenedScope(undefined);
          }}
        />
      )}
    </div>
  );
}
