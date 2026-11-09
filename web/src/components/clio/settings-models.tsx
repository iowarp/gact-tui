import type {
  ContextControls,
  LanguageModelConfiguration,
  LanguageModelPreset,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplyModelConfiguration } from '@/hooks/use-apply-model-configuration';
import { useCatalogModel } from '@/hooks/use-catalog-model';
import { useModelReasoningLevels } from '@/hooks/use-model-reasoning-levels';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import { displayedTags, modelCapabilityTagsFromOption } from '@/lib/model-capability-tags';
import {
  findSelectedModelOption,
  matchesConfiguredModel,
  type ClioModelOption,
} from '@/lib/model-options';
import { providerDisplayName } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ModelCapabilityTags } from './model-capability-tags';
import { providerGroupStatus, type ProviderGroup } from './model-picker-model';
import { ModelSelectField } from './model-select-field';
import { SaveBar } from './primitives/save-bar';
import { StatusIndicator } from './primitives/status-indicator';
import { ReasoningLevelSegmented } from './reasoning-level-segmented';
import {
  modelSettingsUpdate,
  type ModelSettingsValues,
  presetIsActive,
  resolveActivePreset,
  type ResponseSettingName,
  responseSettingsVisible,
  seedModelSettings,
  settingsForChosenModel,
} from './settings-models-form';
import { SettingsProviderOptions } from './settings-provider-options';
import { responseSettingError } from './settings-response-setting-error';
import { SettingsResponseSettings } from './settings-response-settings';
import { SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { WorkingContextRow } from './settings-working-context';
import { useWorkingContext, type WorkingContextState } from './use-working-context';

/**
 * Settings > Models: setting rows. The default model is a select-shaped field
 * that opens the SAME model picker the composer uses; then only what that
 * model supports -- a thinking level when it reasons, its context length,
 * and exactly the response settings it accepts. Choices apply as they are
 * made ("Saved"); typed values wait in one save bar.
 */
export function ModelsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  return (
    <div className="flex flex-col">
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
        <Skeleton
          aria-label="Loading models"
          className="mt-3 h-40 w-full @3xl:w-[60%]"
          role="status"
        />
      )}
    </div>
  );
}

type SavedRow = 'model' | 'effort' | 'values';

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
  const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set());
  const edited = dirty.size > 0;
  const [saving, setSaving] = useState<SavedRow>();
  const [saved, setSaved] = useState<SavedRow>();
  const [seenConfiguration, setSeenConfiguration] = useState(configuration);
  if (configuration !== seenConfiguration) {
    // The service's configuration changed (here or elsewhere): adopt it unless
    // the person has unsaved typed values waiting.
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

  const apply = useApplyModelConfiguration();
  const save = {
    isPending: apply.isPending,
    error: apply.error,
    mutate: (
      row: SavedRow,
      { preset, next }: { preset: LanguageModelPreset; next: ModelSettingsValues },
    ) => {
      const update = modelSettingsUpdate({
        preset,
        seeded: preset.id === activePreset?.id ? seed() : { ...next, effort: '' },
        values: next,
      });
      setSaved(undefined);
      setSaving(row);
      apply.mutate(
        { update, requiresKey: preset.requires_api_key },
        {
          onSuccess: () => {
            setDirty(new Set());
            setSaved(row);
            setSaving(undefined);
          },
        },
      );
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
    save.mutate('model', { preset, next });
  }

  function chooseEffort(effort: ModelSettingsValues['effort']) {
    if (!activePreset) return;
    const next = { ...values, effort };
    setValues(next);
    save.mutate('effort', { preset: activePreset, next });
  }

  function markDirty(key: string) {
    setDirty((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  const catalogStatus =
    catalog.isPending && !catalog.data
      ? 'loading'
      : catalog.error && !catalog.data
        ? 'error'
        : 'ready';
  const providerName = activePreset ? providerDisplayName(activePreset) : undefined;
  const marker = (row: SavedRow) =>
    saving === row && save.isPending ? (
      <SaveMark saving />
    ) : saved === row && !save.error ? (
      <SaveMark />
    ) : null;

  return (
    <div className="flex flex-col" data-slot="models-panel">
      <div data-slot="default-model-card">
        <SettingsRow
          description="The model new work starts with. Changing it also makes it the service's default."
          htmlFor="settings-default-model"
          note={<DefaultModelState group={group} option={option} />}
          title="Default model"
        >
          {marker('model')}
          <ModelSelectField
            catalogStatus={catalogStatus}
            disabled={save.isPending}
            id="settings-default-model"
            modelId={configuration.model || undefined}
            onChange={chooseModel}
            onRetryCatalog={(id) => catalog.refreshCatalog(id)}
            option={option}
            options={options}
            placeholder="No model chosen yet"
            providerId={providerId || undefined}
            providerName={providerName}
            title="Choose the default model"
          />
        </SettingsRow>
      </div>
      {reasoning?.levels.length ? (
        <SettingsRow
          description="How hard the model thinks before it answers. Default is the model's own level."
          title="Thinking"
        >
          {marker('effort')}
          <ReasoningLevelSegmented
            disabled={save.isPending}
            onChange={chooseEffort}
            reasoning={reasoning}
            value={values.effort}
          />
        </SettingsRow>
      ) : null}
      {providerId && catalogModel?.context_controls ? (
        <WorkingContextSection
          key={`${providerId}:${catalogModel.model_id}`}
          modelId={catalogModel.model_id}
          providerId={providerId}
          seed={catalogModel.context_controls}
        >
          {(context) => (
            <ModelsBody
              context={context}
              {...{ values, setValues, dirty, setDirty, markDirty, save, seed, activePreset }}
              barSaving={save.isPending && saving === 'values'}
              catalogModel={catalogModel}
            />
          )}
        </WorkingContextSection>
      ) : (
        <ModelsBody
          {...{ values, setValues, dirty, setDirty, markDirty, save, seed, activePreset }}
          barSaving={save.isPending && saving === 'values'}
          catalogModel={catalogModel}
        />
      )}
    </div>
  );
}

/** Holds the working-context draft so the page's one save bar can carry it. */
function WorkingContextSection({
  providerId,
  modelId,
  seed,
  children,
}: {
  providerId: string;
  modelId: string;
  seed: ContextControls;
  children: (context: WorkingContextState) => ReactNode;
}) {
  const context = useWorkingContext({ providerId, modelId, seed });
  return children(context);
}

function ModelsBody({
  context,
  values,
  setValues,
  dirty,
  setDirty,
  markDirty,
  save,
  seed,
  activePreset,
  catalogModel,
  barSaving,
}: {
  barSaving: boolean;
  context?: WorkingContextState;
  values: ModelSettingsValues;
  setValues: (update: (current: ModelSettingsValues) => ModelSettingsValues) => void;
  dirty: ReadonlySet<string>;
  setDirty: (next: ReadonlySet<string>) => void;
  markDirty: (key: string) => void;
  save: {
    isPending: boolean;
    error: Error | null;
    mutate: (
      row: SavedRow,
      payload: { preset: LanguageModelPreset; next: ModelSettingsValues },
    ) => void;
  };
  seed: () => ModelSettingsValues;
  activePreset: LanguageModelPreset | undefined;
  catalogModel: ReturnType<typeof useCatalogModel>;
}) {
  const count = dirty.size + (context?.draft ? 1 : 0);
  const responseInvalid = Boolean(
    catalogModel?.accepted_parameters?.some(
      (parameter) =>
        dirty.has(parameter.name) &&
        responseSettingError(
          parameter,
          values.settings[parameter.name as ResponseSettingName] ?? '',
        ),
    ),
  );
  return (
    <>
      {context ? <WorkingContextRow state={context} /> : null}
      {responseSettingsVisible(catalogModel?.accepted_parameters, values.settings) ? (
        <SettingsResponseSettings
          dirty={dirty}
          disabled={save.isPending}
          onEdit={(name, value) => {
            markDirty(name);
            setValues((current) => ({
              ...current,
              settings: { ...current.settings, [name]: value },
            }));
          }}
          parameters={catalogModel?.accepted_parameters}
          settings={values.settings}
        />
      ) : null}
      {activePreset?.configuration_fields?.length ? (
        <SettingsProviderOptions
          dirty={dirty}
          fields={activePreset.configuration_fields}
          onEdit={(id, value) => {
            markDirty(id);
            setValues((current) => ({
              ...current,
              providerOptions: { ...current.providerOptions, [id]: value },
            }));
          }}
          values={values.providerOptions}
        />
      ) : null}
      <SaveBar
        className="@3xl:w-[60%]"
        count={count}
        error={save.error?.message ?? context?.saveError}
        invalid={Boolean(context?.draft && context.error) || responseInvalid}
        onDiscard={() => {
          setValues(() => seed());
          setDirty(new Set());
          context?.setDraft(undefined);
        }}
        onSave={() => {
          if (dirty.size && activePreset)
            save.mutate('values', { preset: activePreset, next: values });
          if (context?.draft) context.save();
        }}
        saving={barSaving || Boolean(context?.saving)}
      />
    </>
  );
}

/** The default model's provider state and capability tags, on the row's note line. */
function DefaultModelState({
  group,
  option,
}: {
  group: ProviderGroup | undefined;
  option: ClioModelOption | undefined;
}) {
  const tags = option ? displayedTags(modelCapabilityTagsFromOption(option)) : [];
  const working = group?.health === 'healthy' || group?.health === 'checking';
  return (
    <span className="flex min-w-0 items-center gap-2 overflow-hidden">
      {group ? (
        <span className="shrink-0" data-slot="default-model-status">
          <StatusIndicator
            label={working ? 'Working' : providerGroupStatus(group).label}
            tone={working ? 'success' : 'warning'}
          />
        </span>
      ) : (
        <span>Choose a model to start new work with</span>
      )}
      <ModelCapabilityTags className="flex-nowrap overflow-hidden" size="sm" tags={tags} />
    </span>
  );
}

/** "✓ Saved" beside a choice that applied, or a quiet "Saving…" while it does. */
function SaveMark({ saving = false }: { saving?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[0.71875rem] whitespace-nowrap text-success"
      data-slot="settings-saved"
      role="status"
    >
      {saving ? (
        <span className="text-muted-foreground">Saving…</span>
      ) : (
        <>
          <CheckIcon aria-hidden="true" className="size-3.5" />
          Saved
        </>
      )}
    </span>
  );
}
