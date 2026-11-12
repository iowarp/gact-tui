import type { LanguageModelPreset } from '@clio/core/v3';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useApplyModelConfiguration } from '@/hooks/use-apply-model-configuration';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { vocab } from '@/lib/brand-vocabulary';
import { CUSTOM_SERVER_PRESET_ID, isLocalServerPreset } from '@/lib/local-servers';
import type { ClioModelOption } from '@/lib/model-options';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { ClioModelPicker } from './model-picker';
import type { ProviderGroup } from './model-picker-model';
import { ListDetailLayout } from './primitives/detail-pane';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { SettingsAddServerDialog } from './settings-add-server-dialog';
import { ModelServerDetails } from './settings-model-server-details';
import { ModelServerRow } from './settings-model-server-row';
import { resolveActivePreset } from './settings-models-form';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

/**
 * Settings > Providers: the model servers on this computer or the person's
 * own machines, one item row each (status, hover actions, one slot button),
 * with details beside the list. Cloud and subscription providers are set up
 * in the model picker, which this page opens, on the provider asked for when
 * the page was reached with `?provider=`.
 */
export function ProvidersSettings() {
  const [searchParams] = useSearchParams();
  const requestedProvider = searchParams.get('provider');
  const requestedControl = useRef<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [detailsId, setDetailsId] = useState<string>();
  const { catalog, configuration, groups, options, presets } = useProviderGroups();
  const { servers } = useSavedServers();
  const saved = servers.data ?? [];
  const apply = useApplyModelConfiguration();
  const loading =
    configuration.isPending || (catalog.isPending && !catalog.data) || servers.isPending;
  const error = configuration.error ?? servers.error ?? (catalog.data ? undefined : catalog.error);
  useEffect(() => {
    if (loading || !requestedProvider || !requestedControl.current) return;
    requestedControl.current.scrollIntoView({ block: 'center' });
    requestedControl.current.focus({ preventScroll: true });
  }, [loading, requestedProvider]);
  const active = configuration.data ? resolveActivePreset(configuration.data) : undefined;
  const runtimes = presets.filter(isLocalServerPreset);
  const cloud = presets.filter((preset) => !isLocalServerPreset(preset));
  const customs = saved.filter((server) => server.custom);
  const customPreset = presets.find((preset) => preset.id === CUSTOM_SERVER_PRESET_ID);
  const activeAddress = configuration.data?.api_base ?? '';
  // The default is a custom server when the bound address is one of theirs.
  const defaultCustom =
    active?.id === CUSTOM_SERVER_PRESET_ID
      ? customs.find((server) => server.address === activeAddress)
      : undefined;
  const catalogStatus =
    catalog.isPending && !catalog.data
      ? 'loading'
      : catalog.error && !catalog.data
        ? 'error'
        : 'ready';

  // A runtime is listed once it is in use, saved, found running, or asked for;
  // the others are added from + with their kind.
  const rows = [
    ...runtimes
      .filter((preset) => {
        const group = groups.find((item) => item.id === preset.id);
        return (
          (preset.id === active?.id && !defaultCustom) ||
          saved.some((server) => server.id === preset.id) ||
          foundRunning(group) ||
          preset.id === requestedProvider
        );
      })
      .map((preset) => ({
        id: preset.id,
        preset,
        saved: saved.find((server) => server.id === preset.id),
        isDefault: preset.id === active?.id && !defaultCustom,
      })),
    ...(customPreset
      ? customs.map((server) => ({
          id: server.id,
          preset: customPreset,
          saved: server,
          isDefault: server.id === defaultCustom?.id,
        }))
      : []),
  ];
  const running = rows.filter((row) => {
    const group = groups.find((item) => item.id === row.preset.id);
    return row.saved?.check ? row.saved.check.reachable : !row.saved?.custom && foundRunning(group);
  }).length;
  const opened = rows.find((row) => row.id === detailsId);

  function adoptServer(preset: LanguageModelPreset, address: string, model: string | undefined) {
    const staying = preset.id === active?.id;
    apply.mutate({
      requiresKey: false,
      update: {
        provider_id: preset.provider_id || preset.id,
        provider: preset.provider,
        api_base: address,
        model:
          model ?? (staying ? (configuration.data?.model ?? '') : (preset.suggested_model ?? '')),
        provider_options: {},
      },
    });
  }

  function chooseModel(choice: ClioModelOption) {
    const preset = presets.find((item) => item.id === choice.providerId);
    if (!preset) return;
    const staying = preset.id === active?.id;
    apply.mutate({
      requiresKey: preset.requires_api_key,
      update: {
        provider_id: preset.provider_id || preset.id,
        provider: preset.provider,
        api_base: staying ? (configuration.data?.api_base ?? '') : (preset.api_base ?? ''),
        model: choice.id,
        // Another model of the same provider keeps that provider's options
        // (e.g. Show diffusion); a different provider starts from none.
        provider_options: staying ? (configuration.data?.provider_options ?? {}) : {},
      },
    });
  }

  const requestedCloud = cloud.find((preset) => preset.id === requestedProvider);

  const list = (
    // Lists fill the pane, as on every list page (spec 1722); beside an open
    // details pane the column is the list's whole side.
    <div className="pb-4">
      {/* The list's name is a search result: Ctrl K lands here. */}
      <div data-setting="Model servers">
        <SettingsGroupLabel
          addLabel="Add server"
          className="mt-2"
          info="Model servers on this computer or your own machines."
          onAdd={() => setAdding(true)}
        >
          Model servers
        </SettingsGroupLabel>
        {rows.length ? (
          <ItemList
            className="border-t border-border/70"
            label={`Model servers, ${running} of ${rows.length} running`}
          >
            {rows.map((row) => (
              <div
                className="contents"
                key={row.id}
                ref={
                  row.id === requestedProvider
                    ? (node) => {
                        requestedControl.current =
                          node?.querySelector<HTMLElement>('[data-slot="model-server-row"]') ??
                          null;
                      }
                    : undefined
                }
              >
                <ModelServerRow
                  applying={apply.isPending}
                  group={groups.find((group) => group.id === row.preset.id)}
                  isDefault={row.isDefault}
                  onDetails={() => setDetailsId(row.id)}
                  onUse={(address, model) => adoptServer(row.preset, address, model)}
                  preset={row.preset}
                  saved={row.saved}
                  selected={row.id === detailsId}
                />
              </div>
            ))}
          </ItemList>
        ) : (
          // The group label's + is the one add (spec 1721).
          <StateView kind="empty" size="row" title="No model servers yet" />
        )}
      </div>
      {apply.error ? (
        <p
          className="mt-2 truncate text-xs text-destructive"
          role="alert"
          title={apply.error.message}
        >
          {apply.error.message}
        </p>
      ) : null}
      <SettingsGroupLabel className="mt-6">Cloud and subscription providers</SettingsGroupLabel>
      <div className="@container" data-slot="cloud-providers">
        <SettingsRow
          fullWidth
          info="Cloud and subscription providers are set up from the model picker."
          title="Keys and sign-ins"
        >
          <ClioModelPicker
            catalogStatus={catalogStatus}
            onChange={chooseModel}
            onRetryCatalog={(id) => catalog.refreshCatalog(id)}
            options={options}
            provider={requestedCloud?.id ?? active?.id}
            trigger={
              <Button
                ref={
                  requestedCloud
                    ? (node) => {
                        requestedControl.current = node;
                      }
                    : undefined
                }
                className="h-[1.875rem] px-3 text-[0.78125rem]"
                size="sm"
                type="button"
                variant="outline"
              >
                Open model picker
              </Button>
            }
          />
        </SettingsRow>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col" data-slot="providers-settings">
      <SettingsSectionHeading
        info={`Where ${vocab.agent}'s models come from: model servers you run, and cloud or subscription accounts.`}
        title="Providers"
      />
      {error ? (
        <div className={SETTINGS_COLUMN} title={error.message}>
          <StateView
            action={{
              label: 'Retry',
              onClick: () => {
                void configuration.refetch();
                void servers.refetch();
              },
            }}
            kind="error"
            size="row"
            title="The agent could not load providers."
          />
        </div>
      ) : loading ? (
        <StateView kind="loading" size="row" title="Loading providers…" />
      ) : (
        <ListDetailLayout
          detail={
            opened ? (
              <ModelServerDetails
                catalogEntry={catalog.data?.providers.find(
                  (entry) => entry.id === opened.preset.id,
                )}
                group={groups.find((group) => group.id === opened.preset.id)}
                isDefault={opened.isDefault}
                applying={apply.isPending}
                onUse={(address, model) => adoptServer(opened.preset, address, model)}
                onClose={() => setDetailsId(undefined)}
                preset={opened.preset}
                saved={opened.saved}
              />
            ) : undefined
          }
          list={list}
        />
      )}
      <SettingsAddServerDialog onOpenChange={setAdding} open={adding} runtimes={runtimes} />
    </div>
  );
}

/** The service's catalog found this runtime answering with models. */
function foundRunning(group: ProviderGroup | undefined): boolean {
  return (
    Boolean(group?.choices.length) && (group?.health === 'healthy' || group?.health === 'checking')
  );
}
