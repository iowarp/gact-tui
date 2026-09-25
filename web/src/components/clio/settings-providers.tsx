import { useSearchParams } from 'react-router-dom';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { IconTile } from '@/components/reui/icon-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { providerUsableModelCount, type ProviderGroup } from './model-picker-model';
import { useProviderActions } from './provider-actions';
import { ProviderHeartbeat } from './provider-heartbeat';
import { SettingsSectionHeading } from './settings-section-heading';
import { ProviderSettingsPanel } from './settings-provider-panel';

/**
 * Settings > Providers: one entry per provider the service reports, each with
 * the same heartbeat the model picker shows; selecting one opens its
 * management panel (state, actions, availability, models, visibility).
 * `?provider=<id>` selects a provider -- the link the picker's strip and the
 * service's own `configuration_url` both hand out.
 */
export function ProvidersSettings() {
  const { catalog, configuration, groups, presets } = useProviderGroups();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('provider');
  const selected = groups.find((group) => group.id === requested) ?? groups[0];
  const preset = presets.find((item) => item.id === selected?.id);
  // ONE actions instance for the selected provider -- the same hook the
  // picker runs for its open submenu; it resets when the selection changes.
  const actions = useProviderActions({
    presetId: selected?.id ?? '',
    apiBase: selected?.endpoint ?? preset?.api_base ?? '',
    preset,
  });
  const loading = configuration.isPending || (catalog.isPending && !catalog.data);
  const error = configuration.error ?? (catalog.data ? undefined : catalog.error);

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        info="Sign-in, API keys and model discovery for each provider the connected service reports."
        title="Providers"
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : loading ? (
        <ProvidersSkeleton />
      ) : !groups.length ? (
        <p className="text-sm text-muted-foreground">No providers reported.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Providers" className="grid content-start gap-1">
            {groups.map((group) => (
              <ProviderListEntry
                group={group}
                key={group.id}
                onSelect={() =>
                  setSearchParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('provider', group.id);
                      return next;
                    },
                    { replace: true },
                  )
                }
                selected={group.id === selected?.id}
                stage={group.id === selected?.id ? actions.stage : undefined}
              />
            ))}
          </nav>
          {selected ? (
            <ProviderSettingsPanel
              actions={actions}
              catalogEntry={catalog.data?.providers.find((entry) => entry.id === selected.id)}
              group={selected}
              key={selected.id}
              preset={preset}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProviderListEntry({
  group,
  onSelect,
  selected,
  stage,
}: {
  group: ProviderGroup;
  onSelect: () => void;
  selected: boolean;
  stage?: string;
}) {
  const count = providerUsableModelCount(group);
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md pe-1',
        selected ? 'bg-secondary' : 'hover:bg-muted/60',
      )}
      data-provider-id={group.id}
      data-slot="provider-list-entry"
    >
      <Button
        aria-current={selected ? 'true' : undefined}
        className="h-10 min-w-0 flex-1 justify-start gap-2 px-2 hover:bg-transparent"
        onClick={onSelect}
        type="button"
        variant="ghost"
      >
        <IconTile aria-hidden="true" size="sm" variant="outline">
          <ModelSelectorLogo className="size-5" provider={providerLogoId(group.id)} />
        </IconTile>
        <span className="min-w-0 flex-1 truncate text-start">{group.name}</span>
        {count ? (
          <Badge aria-label={`${count} models`} className="shrink-0" variant="secondary">
            {count}
          </Badge>
        ) : null}
      </Button>
      <ProviderHeartbeat group={group} stage={stage} />
    </div>
  );
}

function ProvidersSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading providers"
      className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]"
      role="status"
    >
      <div className="grid content-start gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-10 w-full" key={index} />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
