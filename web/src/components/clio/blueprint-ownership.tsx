import { useQuery } from '@tanstack/react-query';
import { StoreIcon } from 'lucide-react';
import type { AgentBlueprintReference } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { InfoTip } from './info-tip';

/** Show the marketplace and host behind a qualified blueprint identity. */
export function BlueprintOwnership({ blueprint }: { blueprint: AgentBlueprintReference }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sourceId = blueprint.registry_id ?? blueprint.id.split('::')[1];
  const sources = useQuery({
    queryKey: ['agent-blueprint-sources', settings.endpoint, connectionScope(settings)],
    queryFn: ({ signal }) => repository.agentBlueprintSources(signal),
  });
  const source = sources.data?.find((row) => row.id === sourceId);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <StoreIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">
        {source?.name ?? (sourceId ? 'Marketplace' : 'Local blueprint')}
      </span>
      <InfoTip label={`Source of ${blueprint.display_name}`}>
        {source?.name ?? sourceId ?? 'Local blueprint'} · {source?.source ?? 'Local files'}
        {' · '}
        {blueprint.scope === 'global' ? 'All workspaces' : 'This workspace'}
        {' · '}
        {settings.label || settings.endpoint}
        {' · '}
        {blueprint.blueprint_id ?? blueprint.id.split('::').at(-1)}
      </InfoTip>
    </div>
  );
}
