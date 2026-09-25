import type { LanguageModelPreset, ProviderCatalogEntry } from '@clio/core/v3';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { IconTile } from '@/components/reui/icon-tile';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useHiddenProviders } from '@/hooks/use-hidden-providers';
import { providerLogoId } from '@/lib/provider-presentation';
import { providerGroupStatus, type ProviderGroup } from './model-picker-model';
import type { ProviderActions } from './provider-action-panel';
import { ProviderHeartbeat } from './provider-heartbeat';
import { ProviderManagementStrip } from './provider-management-strip';
import { ProviderAvailabilityFacts, ProviderModelList } from './settings-provider-facts';

interface ProviderSettingsPanelProps {
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
  actions: ProviderActions;
}

/**
 * One provider's management view on Settings > Providers: its state, the
 * picker's own action strip (same component, same hook instance semantics:
 * key entry first for a key provider, Sign in / Device code, Install, or
 * Verify / Refresh / Sign out once ready), then availability, models and
 * visibility. Labels and state only; explanation sits behind info icons.
 */
export function ProviderSettingsPanel({
  group,
  preset,
  catalogEntry,
  actions,
}: ProviderSettingsPanelProps) {
  const { hiddenProviders, setProviderHidden } = useHiddenProviders();
  const hidden = hiddenProviders.has(group.id);
  // The settled health; a running action's stage shows in the strip and turns
  // the heartbeat yellow instead of being repeated here.
  const state = providerGroupStatus(group).label;
  const visibilityId = `provider-visibility-${group.id}`;

  return (
    <section
      aria-label={`${group.name} provider`}
      className="grid min-w-0 content-start gap-5"
      data-slot="provider-settings-panel"
    >
      <header className="flex flex-wrap items-center gap-3">
        <IconTile aria-hidden="true" size="lg" variant="outline">
          <ModelSelectorLogo className="size-6" provider={providerLogoId(group.id)} />
        </IconTile>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-xl font-semibold">{group.name}</h2>
          <ProviderHeartbeat group={group} stage={actions.stage} />
          <span className="text-sm text-muted-foreground" data-slot="provider-state">
            {state}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            aria-describedby={`${visibilityId}-state`}
            checked={!hidden}
            id={visibilityId}
            onCheckedChange={(shown) => setProviderHidden(group.id, !shown)}
          />
          <Label className="text-sm font-normal" htmlFor={visibilityId}>
            Show in model picker
          </Label>
          <span className="sr-only" id={`${visibilityId}-state`}>
            {hidden ? 'Hidden' : 'Shown'}
          </span>
        </div>
      </header>
      <ProviderManagementStrip actions={actions} group={group} preset={preset} size="default" />
      <Separator />
      <ProviderModelList group={group} />
      <Separator />
      <ProviderAvailabilityFacts catalogEntry={catalogEntry} group={group} preset={preset} />
    </section>
  );
}
