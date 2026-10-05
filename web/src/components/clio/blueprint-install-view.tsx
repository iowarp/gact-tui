import type { AgentBlueprintReference } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BoxesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { vocab } from '@/lib/brand-vocabulary';

/** An available entry has no runtime files until explicitly materialized. */
export function BlueprintInstallView({
  blueprint,
  workspaceId,
}: {
  blueprint: AgentBlueprintReference;
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queries = useQueryClient();
  const install = useMutation({
    mutationFn: () =>
      repository.installAgentBlueprint({
        source_id: blueprint.registry_id!,
        blueprint_id: blueprint.blueprint_id ?? blueprint.id,
        scope: blueprint.scope === 'global' ? 'global' : 'workspace',
        workspace_id: workspaceId,
      }),
    onSuccess: () =>
      queries.invalidateQueries({
        queryKey: queryKeys.agentBlueprints(settings.endpoint),
      }),
  });
  return (
    <section
      aria-label="Available blueprint"
      className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"
    >
      <BoxesIcon aria-hidden="true" className="size-7 text-primary" />
      <h3 className="font-medium">{blueprint.display_name}</h3>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Available to install</span>
        <InfoTip label="About blueprint installation">
          Selecting this blueprint for a conversation installs it automatically on the connected{' '}
          {vocab.agent}. Install here to inspect or edit its files first.
        </InfoTip>
      </div>
      <p className="max-w-full truncate text-xs text-muted-foreground">{settings.endpoint}</p>
      <Button
        disabled={!blueprint.enabled || !blueprint.registry_id || install.isPending}
        onClick={() => install.mutate()}
      >
        {install.isPending ? 'Installing…' : 'Install to browse files'}
      </Button>
      {install.error ? (
        <p className="text-sm text-destructive" role="alert">
          {install.error.message}
        </p>
      ) : null}
    </section>
  );
}
