import type { LanguageModelConfiguration, LanguageModelPreset } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Frame, FramePanel } from '@/components/clio/settings-frame';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplyModelConfiguration } from '@/hooks/use-apply-model-configuration';
import { useCatalogModel } from '@/hooks/use-catalog-model';
import { useModelReasoningLevels } from '@/hooks/use-model-reasoning-levels';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import {
  findSelectedModelOption,
  matchesConfiguredModel,
  type ClioModelOption,
} from '@/lib/model-options';
import { providerDisplayName } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ReasoningLevelSegmented } from './reasoning-level-segmented';
import { SettingsDefaultModelCard } from './settings-default-model-card';
import {
  modelSettingsUpdate,
  type ModelSettingsValues,
  presetIsActive,
  resolveActivePreset,
  responseSettingsVisible,
  seedModelSettings,
  settingsForChosenModel,
} from './settings-models-form';
import { SettingsProviderOptions } from './settings-provider-options';
import { SettingsResponseSettings } from './settings-response-settings';
import { SettingsSectionHeading } from './settings-section-heading';
import { SettingsWorkingContext } from './settings-working-context';

/**
 * Settings > Models: the model new work starts with, as ONE card with Change
 * (the same model picker the composer uses), then only what that model
 * supports -- a thinking level when it reasons, and exactly the response
 * settings it accepts (none, a few inline, or a local server's long list
 * behind one grouped disclosure). A model choice applies as it is made.
 */
export function ModelsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        info="The model new work starts with. Changing it also makes it the service's default."
        title="Models"
      />
      {configuration.data ? (
        <ModelsSettingsContent configuration={configuration.data} key={settings.endpoint} />
      ) : configuration.error ? (
        <p className="text-sm text-destructive" role="alert">
          {configuration.error.message}
        </p>
      ) : (
        <Skeleton aria-label="Loading models" className="h-40 w-full max-w-2xl" role="status" />
      )}
    </div>
  );
}

function ModelsSettingsContent({ configuration }: { configuration: LanguageModelConfiguration }) {
  const { catalog, groups, options } = useProviderGroups();
  const activePreset = resolveActivePreset(configuration);
  const seed = () =>
    seedModelSettings({
      configuration,
      preset: activePreset,
      presetIsActive: Boolean(activePreset),
    });
  const [values, setValues] = useState(seed);
  const [edited, setEdited] = useState(false);
  const [seenConfiguration, setSeenConfiguration] = useState(configuration);
  if (configuration !== seenConfiguration) {
    // The service's configuration changed (here or elsewhere): adopt it unless
    // the person has unsaved response settings open.
    setSeenConfiguration(configuration);
    if (!edited) setValues(seed());
  }

  const providerId = activePreset?.id ?? configuration.provider_id;
  const option =
    findSelectedModelOption(options, providerId, configuration.model) ??
    options.find(
      (candidate) =>
        candidate.providerId === providerId &&
        matchesConfiguredModel(candidate, configuration.model, configuration.resolved_model_id),
    );
  const group = groups.find((item) => item.id === providerId);
  const reasoning = useModelReasoningLevels(
    providerId,
    configuration.model,
    configuration.resolved_model_id,
  );
  const catalogModel = useCatalogModel(
    providerId,
    configuration.model,
    configuration.resolved_model_id,
  );

  const apply = useApplyModelConfiguration(() => setEdited(false));
  const save = {
    isPending: apply.isPending,
    error: apply.error,
    mutate: ({ preset, next }: { preset: LanguageModelPreset; next: ModelSettingsValues }) => {
      const update = modelSettingsUpdate({
        preset,
        seeded: preset.id === activePreset?.id ? seed() : { ...next, effort: '' },
        values: next,
      });
      apply.mutate({ update, requiresKey: preset.requires_api_key });
    },
  };

  function chooseModel(choice: ClioModelOption) {
    const preset = configuration.presets.find((item) => item.id === choice.providerId);
    if (!preset) return;
    const staying = presetIsActive(configuration, preset);
    const next: ModelSettingsValues = {
      ...values,
      apiBase: staying ? values.apiBase : (preset.api_base ?? ''),
      providerOptions: staying ? values.providerOptions : {},
      modelId: choice.id,
      settings: settingsForChosenModel(values.settings, choice.contextWindow),
      // A level belongs to a model: a new model starts on its own default.
      effort: staying && choice.id === configuration.model ? values.effort : '',
    };
    setValues(next);
    save.mutate({ preset, next });
  }

  function chooseEffort(effort: ModelSettingsValues['effort']) {
    if (!activePreset) return;
    const next = { ...values, effort };
    setValues(next);
    save.mutate({ preset: activePreset, next });
  }

  function saveValues() {
    if (activePreset) save.mutate({ preset: activePreset, next: values });
  }

  return (
    <Frame className="max-w-2xl" data-slot="models-panel" stacked>
      <FramePanel className="flex flex-col gap-4">
        <SettingsDefaultModelCard
          busy={save.isPending}
          catalogStatus={
            catalog.isPending && !catalog.data
              ? 'loading'
              : catalog.error && !catalog.data
                ? 'error'
                : 'ready'
          }
          group={group}
          modelId={configuration.model || undefined}
          onChange={chooseModel}
          onRetryCatalog={(id) => catalog.refreshCatalog(id)}
          option={option}
          options={options}
          providerId={providerId || undefined}
          providerName={activePreset ? providerDisplayName(activePreset) : undefined}
        />
        {reasoning?.levels.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="text-sm font-medium">Thinking</span>
            <ReasoningLevelSegmented
              disabled={save.isPending}
              onChange={chooseEffort}
              reasoning={reasoning}
              value={values.effort}
            />
          </div>
        ) : null}
        <SaveState error={save.error?.message} saving={save.isPending} />
      </FramePanel>
      {responseSettingsVisible(catalogModel?.accepted_parameters, values.settings) ? (
        <FramePanel className="py-3">
          <SettingsResponseSettings
            edited={edited}
            onEdit={(name, value) => {
              setEdited(true);
              setValues((current) => ({
                ...current,
                settings: { ...current.settings, [name]: value },
              }));
            }}
            onSave={saveValues}
            parameters={catalogModel?.accepted_parameters}
            saving={save.isPending}
            settings={values.settings}
          />
        </FramePanel>
      ) : null}
      {providerId && catalogModel?.context_controls ? (
        <FramePanel className="py-3">
          <SettingsWorkingContext
            key={`${providerId}:${catalogModel.model_id}`}
            modelId={catalogModel.model_id}
            providerId={providerId}
            seed={catalogModel.context_controls}
          />
        </FramePanel>
      ) : null}
      {activePreset?.configuration_fields?.length ? (
        <FramePanel className="py-3">
          <SettingsProviderOptions
            edited={edited}
            fields={activePreset.configuration_fields}
            onEdit={(id, value) => {
              setEdited(true);
              setValues((current) => ({
                ...current,
                providerOptions: { ...current.providerOptions, [id]: value },
              }));
            }}
            onSave={saveValues}
            saving={save.isPending}
            values={values.providerOptions}
          />
        </FramePanel>
      ) : null}
    </Frame>
  );
}

function SaveState({ saving, error }: { saving: boolean; error?: string }) {
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  return saving ? (
    <p className="text-sm text-muted-foreground" role="status">
      Saving…
    </p>
  ) : null;
}
