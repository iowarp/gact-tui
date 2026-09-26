import type { LanguageModelPreset } from '@clio/core/v3';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplyModelConfiguration } from '@/hooks/use-apply-model-configuration';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { CUSTOM_SERVER_PRESET_ID, isLocalServerPreset } from '@/lib/local-servers';
import type { ClioModelOption } from '@/lib/model-options';
import { providerDisplayName, providerLogoId } from '@/lib/provider-presentation';
import { ClioModelPicker } from './model-picker';
import { resolveActivePreset } from './settings-models-form';
import { SettingsAddServerDialog } from './settings-add-server-dialog';
import { SettingsLocalServerCard } from './settings-local-server-card';
import { SettingsSectionHeading } from './settings-section-heading';

/**
 * Settings > Providers: what the model picker cannot do -- model servers
 * that run on this computer or the person's own machines. Each local server
 * is a card with its status and its address, edited in place, saved on the
 * service (which probes it from then on) and checked at once; "Add a
 * server" saves any OpenAI-compatible address. Cloud and
 * subscription providers are set up in the model picker, which this page
 * opens on the provider asked for.
 */
export function ProvidersSettings() {
  const { catalog, configuration, groups, options, presets } = useProviderGroups();
  const { servers } = useSavedServers();
  const saved = servers.data ?? [];
  const apply = useApplyModelConfiguration();
  const loading = configuration.isPending || (catalog.isPending && !catalog.data) || servers.isPending;
  const error = configuration.error ?? servers.error ?? (catalog.data ? undefined : catalog.error);
  const active = configuration.data ? resolveActivePreset(configuration.data) : undefined;
  const locals = presets.filter(isLocalServerPreset);
  const others = presets.filter((preset) => !isLocalServerPreset(preset));
  const customs = saved.filter((server) => server.custom);
  const customPreset = presets.find((preset) => preset.id === CUSTOM_SERVER_PRESET_ID);
  const activeAddress = configuration.data?.api_base ?? '';
  // The default is a custom server when the bound address is one of theirs.
  const defaultCustom = active?.id === CUSTOM_SERVER_PRESET_ID
    ? customs.find((server) => server.address === activeAddress)
    : undefined;
  const catalogStatus = catalog.isPending && !catalog.data ? 'loading' : catalog.error && !catalog.data ? 'error' : 'ready';

  function adoptServer(preset: LanguageModelPreset, address: string, model: string | undefined) {
    const staying = preset.id === active?.id;
    apply.mutate({
      requiresKey: false,
      update: {
        provider_id: preset.provider_id || preset.id,
        provider: preset.provider,
        api_base: address,
        model: model ?? (staying ? (configuration.data?.model ?? '') : (preset.suggested_model ?? '')),
        provider_options: {},
      },
    });
  }

  function chooseModel(choice: ClioModelOption) {
    const preset = presets.find((item) => item.id === choice.providerId);
    if (!preset) return;
    apply.mutate({
      requiresKey: preset.requires_api_key,
      update: {
        provider_id: preset.provider_id || preset.id,
        provider: preset.provider,
        api_base: preset.id === active?.id ? (configuration.data?.api_base ?? '') : (preset.api_base ?? ''),
        model: choice.id,
        provider_options: {},
        ...(choice.transport ? { variant: choice.transport } : {}),
      },
    });
  }

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        info="Model servers on this computer or your own machines. Cloud and subscription providers are set up from the model picker."
        title="Providers"
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : loading ? (
        <Skeleton aria-label="Loading providers" className="h-64 w-full max-w-3xl" role="status" />
      ) : (
        <>
          <Frame className="max-w-3xl" data-slot="local-servers" stacked>
            <FrameHeader className="flex-row items-center justify-between gap-3">
              <FrameTitle>Model servers</FrameTitle>
              <SettingsAddServerDialog />
            </FrameHeader>
            {locals.map((preset) => (
              <FramePanel key={preset.id}>
                <SettingsLocalServerCard
                  applying={apply.isPending}
                  catalogEntry={catalog.data?.providers.find((entry) => entry.id === preset.id)}
                  group={groups.find((group) => group.id === preset.id)}
                  isDefault={preset.id === active?.id && !defaultCustom}
                  onUse={(address, model) => adoptServer(preset, address, model)}
                  preset={preset}
                  saved={saved.find((server) => server.id === preset.id)}
                />
              </FramePanel>
            ))}
            {customPreset
              ? customs.map((server) => (
                  <FramePanel key={server.id}>
                    <SettingsLocalServerCard
                      applying={apply.isPending}
                      catalogEntry={undefined}
                      group={undefined}
                      isDefault={server.id === defaultCustom?.id}
                      onUse={(address, model) => adoptServer(customPreset, address, model)}
                      preset={customPreset}
                      saved={server}
                    />
                  </FramePanel>
                ))
              : null}
          </Frame>
          {apply.error ? (
            <p className="text-sm text-destructive" role="alert">
              {apply.error.message}
            </p>
          ) : null}
          <section aria-labelledby="cloud-providers" className="grid max-w-3xl gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold" id="cloud-providers">
                Cloud and subscription providers
              </h2>
              <p className="text-sm text-muted-foreground">Keys and sign-ins live in the model picker.</p>
            </div>
            <div className="flex flex-wrap gap-2" data-slot="cloud-providers">
              {others.map((preset) => (
                <ClioModelPicker
                  catalogStatus={catalogStatus}
                  key={preset.id}
                  onChange={chooseModel}
                  onRetryCatalog={(id) => catalog.refreshCatalog(id)}
                  options={options}
                  provider={preset.id}
                  trigger={
                    <Button className="h-9 gap-2 ps-1.5" type="button" variant="outline">
                      <IconTile aria-hidden="true" size="xs" variant="outline">
                        <ModelSelectorLogo className="size-4" provider={providerLogoId(preset.id)} />
                      </IconTile>
                      {providerDisplayName(preset)}
                    </Button>
                  }
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
