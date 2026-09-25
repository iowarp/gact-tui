import { queryKeys } from '@/lib/query-keys';
import type { LanguageModelConfiguration } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Input } from '@/components/ui/input';
import { readProviderCredential } from '@/tauri/secure-credentials';
import { providerDisplayName } from '@/lib/provider-presentation';
import { clearCachedSessionModelReferences } from '@/lib/session-model-state';
import { useLiveStore } from '@/store/live-store';
import { useModelReasoningLevels } from '@/hooks/use-model-reasoning-levels';
import { InfoTip } from './info-tip';
import { providerHealthPresentation, type ProviderGroup } from './model-picker-model';
import { ReasoningLevelField } from './reasoning-level-field';
import {
  canApplyProvider,
  modelSettingsOptions,
  modelSettingsUpdate,
  presetIsActive,
  providerSupportsRuntimeSizing,
  resolveActivePreset,
  seedModelSettings,
  type ModelSettingsValues,
} from './settings-models-form';
import { ProviderSetupRow } from './settings-models-provider-row';
import { SettingsSectionHeading } from './settings-section-heading';

/**
 * Settings > Models: the model and session defaults for new work -- default
 * provider and model, reasoning, endpoint overrides, token cap, temperature.
 * Provider management (sign-in, keys, checks, availability) lives on
 * Settings > Providers; a provider that is not ready shows one row linking
 * there, never an inline form.
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
        info="The provider, model and reasoning effort new work starts with. Applying also makes this the backend default."
        title="Models"
      />
      {configuration.data ? (
        <ModelsSettingsContent configuration={configuration.data} key={settings.endpoint} />
      ) : configuration.error ? (
        <p className="text-sm text-destructive">{configuration.error.message}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}

function ModelsSettingsContent({ configuration }: { configuration: LanguageModelConfiguration }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const clearSessionModelReferences = useLiveStore((state) => state.clearSessionModelReferences);
  const { settings } = useConnectionSettings();
  const { groups } = useProviderGroups();
  const initialPreset = resolveActivePreset(configuration);
  const [presetId, setPresetId] = useState(initialPreset?.id ?? configuration.provider_id ?? '');
  const [seeded, setSeeded] = useState(() =>
    seedModelSettings({
      configuration,
      preset: initialPreset,
      presetIsActive: presetIsActive(configuration, initialPreset),
    }),
  );
  const [values, setValues] = useState(seeded);
  const [edited, setEdited] = useState(false);
  const [seenConfiguration, setSeenConfiguration] = useState(configuration);
  const selectedPreset = configuration.presets.find((preset) => preset.id === presetId);
  const selectedGroup = groups.find((group) => group.id === presetId);

  if (configuration !== seenConfiguration) {
    setSeenConfiguration(configuration);
    if (!edited) {
      const reseeded = seedModelSettings({
        configuration,
        preset: selectedPreset,
        presetIsActive: presetIsActive(configuration, selectedPreset),
      });
      setSeeded(reseeded);
      setValues(reseeded);
    }
  }

  const edit = (patch: Partial<ModelSettingsValues>) => {
    setEdited(true);
    setValues((current) => ({ ...current, ...patch }));
  };
  // The key itself is entered on Settings > Providers; Apply only forwards the
  // stored one with the configuration write.
  const storedCredential = useQuery({
    enabled: Boolean(selectedPreset?.requires_api_key && values.apiBase),
    queryKey: [
      'provider-credential',
      selectedPreset?.provider_id ?? selectedPreset?.id,
      values.apiBase,
    ],
    queryFn: () =>
      readProviderCredential(
        selectedPreset?.provider_id ?? selectedPreset?.id ?? '',
        values.apiBase,
      ),
  });
  const supportsRuntimeControls = providerSupportsRuntimeSizing(selectedPreset);
  const providerReadyForApply = canApplyProvider(selectedPreset, values, storedCredential.data);
  const models = useQuery({
    queryKey: queryKeys.key('provider-models', settings.endpoint, presetId),
    queryFn: ({ signal }) => repository.providerModels(presetId, signal),
    enabled: Boolean(presetId && selectedPreset?.is_authenticated),
  });
  const modelOptions = modelSettingsOptions({
    catalog: models.data?.models ?? [],
    configuration,
    modelId: values.modelId,
    preset: selectedPreset,
  });
  // Only the levels this model's provider reports for it (none: no selector).
  // `resolved_model_id` only names the SEEDED (unedited) model; once the
  // person picks a different one, `values.modelId` is a real catalog id and
  // matches by id directly.
  const reasoning = useModelReasoningLevels(
    presetId,
    values.modelId,
    values.modelId === configuration.model ? configuration.resolved_model_id : undefined,
  );
  const selectedModelIsCandidate = modelOptions.some(
    (model) => model.id === values.modelId && model.availability === 'candidate',
  );
  const providerNotReady =
    selectedGroup !== undefined &&
    selectedGroup.health !== 'healthy' &&
    selectedGroup.health !== 'checking';

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedPreset || !values.modelId) throw new Error('Choose a provider and model first.');
      const update = modelSettingsUpdate({ preset: selectedPreset, seeded, values });
      if (selectedPreset.requires_api_key) {
        const stored =
          storedCredential.data ??
          (await readProviderCredential(update.provider_id, update.api_base));
        if (stored) update.api_key = stored;
      }
      return repository.updateLanguageModelConfiguration(update);
    },
    onSuccess: async (next) => {
      setEdited(false);
      queryClient.setQueryData(
        queryKeys.key('language-model-configuration', settings.endpoint),
        next,
      );
      clearCachedSessionModelReferences(queryClient, settings.endpoint);
      clearSessionModelReferences();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.capabilities(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerModels(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerCatalog(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('sessions', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('session-defaults', settings.endpoint),
        }),
      ]);
    },
  });

  return (
    <div className="grid gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="provider-choice">Provider</FieldLabel>
          <Select
            onValueChange={(value) => {
              setPresetId(value);
              const preset = configuration.presets.find((item) => item.id === value);
              const active = presetIsActive(configuration, preset);
              edit({
                apiBase: active ? configuration.api_base : (preset?.api_base ?? ''),
                modelId: active ? configuration.model : (preset?.suggested_model ?? ''),
                providerOptions: active ? (configuration.provider_options ?? {}) : {},
              });
            }}
            value={presetId}
          >
            <SelectTrigger id="provider-choice">
              <SelectValue placeholder="Choose a provider" />
            </SelectTrigger>
            <SelectContent>
              {configuration.presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <ProviderOptionLabel
                    group={groups.find((group) => group.id === preset.id)}
                    name={providerDisplayName(preset)}
                  />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {providerNotReady && selectedGroup ? <ProviderSetupRow group={selectedGroup} /> : null}
        </Field>
        <Field>
          <LabelWithInfo
            htmlFor="model-choice"
            info={
              models.data?.source === 'static_catalog'
                ? 'Candidate models only. Verify the provider on Settings > Providers to confirm account availability.'
                : models.data?.staleness
                  ? 'Previously discovered models. Verify the provider to confirm current availability.'
                  : 'Models the connected agent discovered for this provider.'
            }
            label="Model"
          />
          <Select
            disabled={!presetId || models.isFetching}
            onValueChange={(value) => edit({ modelId: value })}
            value={values.modelId}
          >
            <SelectTrigger id="model-choice">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((model) => (
                <SelectItem
                  disabled={model.availability === 'candidate'}
                  key={model.id}
                  value={model.id}
                >
                  {model.name ?? ('label' in model ? model.label : undefined) ?? model.id}
                  {model.availability === 'candidate' ? ' (unverified)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {models.isError ? (
            <p className="text-xs text-destructive" title={models.error.message}>
              Models could not be loaded
            </p>
          ) : null}
        </Field>
        <ReasoningLevelField
          allowModelDefault
          id="model-effort"
          info="The reasoning depth new work uses with this model. Default leaves it to the model."
          onChange={(effort) => edit({ effort: effort ?? '' })}
          reasoning={reasoning}
          value={values.effort || undefined}
        />
        <Field>
          <LabelWithInfo
            htmlFor="provider-api-base"
            info={
              (selectedPreset?.provider_id ?? selectedPreset?.id) === 'vllm'
                ? 'The vLLM host and port, including the OpenAI-compatible /v1 path.'
                : 'The endpoint the connected service uses for this provider.'
            }
            label="Endpoint override"
          />
          <Input
            autoComplete="url"
            id="provider-api-base"
            onChange={(event) => edit({ apiBase: event.target.value })}
            placeholder="http://127.0.0.1:8000/v1"
            value={values.apiBase}
          />
        </Field>
        {(selectedPreset?.configuration_fields ?? []).map((field) => (
          <Field key={field.id}>
            <LabelWithInfo
              htmlFor={`provider-option-${field.id}`}
              info={field.description}
              label={field.label}
            />
            <Input
              id={`provider-option-${field.id}`}
              onChange={(event) =>
                edit({
                  providerOptions: { ...values.providerOptions, [field.id]: event.target.value },
                })
              }
              placeholder={field.placeholder}
              required={field.required}
              value={values.providerOptions[field.id] ?? ''}
            />
          </Field>
        ))}
        {supportsRuntimeControls ? (
          <>
            <NumberField
              id="provider-parallel"
              info="Not reported back by the service. Empty leaves the runtime's own sizing untouched."
              label="Parallel model slots"
              min={0}
              onChange={(parallel) => edit({ parallel })}
              placeholder="Runtime default"
              value={values.parallel}
            />
            <NumberField
              id="provider-context-length"
              info="Empty keeps the runtime-discovered or deployment default context window."
              label="Context length"
              min={0}
              onChange={(contextLength) => edit({ contextLength })}
              placeholder="Runtime default"
              value={values.contextLength}
            />
          </>
        ) : null}
        <NumberField
          id="provider-max-tokens"
          info="Empty means no cap is recorded and the provider applies its own."
          label="Maximum output tokens"
          min={1}
          onChange={(maxTokens) => edit({ maxTokens })}
          placeholder="Provider default"
          value={values.maxTokens}
        />
        <NumberField
          id="provider-temperature"
          info="Empty leaves the provider's own default."
          label="Temperature"
          max={2}
          min={0}
          onChange={(temperature) => edit({ temperature })}
          placeholder="Provider default"
          step={0.1}
          value={values.temperature}
        />
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={
            !providerReadyForApply || !values.modelId || selectedModelIsCandidate || save.isPending
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Applying…' : 'Apply provider and model'}
        </Button>
        {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
      </div>
    </div>
  );
}

function ProviderOptionLabel({ group, name }: { group?: ProviderGroup; name: string }) {
  const notReady = group && group.health !== 'healthy' && group.health !== 'checking';
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{name}</span>
      {notReady ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {providerHealthPresentation(group.health).label}
        </span>
      ) : null}
    </span>
  );
}

function LabelWithInfo({
  htmlFor,
  info,
  label,
}: {
  htmlFor: string;
  info?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {info ? <InfoTip label={`About ${label}`}>{info}</InfoTip> : null}
    </div>
  );
}

function NumberField({
  id,
  info,
  label,
  onChange,
  value,
  ...input
}: {
  id: string;
  info: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
  max?: number;
  min?: number;
  placeholder?: string;
  step?: number;
}) {
  return (
    <Field>
      <LabelWithInfo htmlFor={id} info={info} label={label} />
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
        {...input}
      />
    </Field>
  );
}
