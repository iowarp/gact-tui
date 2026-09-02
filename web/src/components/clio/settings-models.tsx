import { queryKeys } from '@/lib/query-keys';
import type {
  LanguageModelConfiguration,
  ProviderDefinition,
  ProviderHandshake,
  ProviderModelRefreshResult,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, RadioTowerIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Input } from '@/components/ui/input';
import { providerAvailability } from '@/lib/provider-availability';
import { providerDisplayName, providerSummary } from '@/lib/provider-presentation';
import {
  modelSettingsUpdate,
  presetIsActive,
  REASONING_EFFORTS,
  resolveActivePreset,
  seedModelSettings,
  type ModelSettingsValues,
  type ReasoningEffort,
} from './settings-models-form';
import { ClioSettingsSection } from './settings-section';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

export function ModelsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const providers = useQuery({
    queryKey: queryKeys.key('providers', settings.endpoint),
    queryFn: ({ signal }) => repository.providers(signal),
  });
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="Choose the provider, model, and reasoning effort used for new work. Availability comes directly from the connected service."
        title="Models"
      />
      {configuration.data ? (
        <ModelsSettingsContent
          configuration={configuration.data}
          key={settings.endpoint}
          providers={providers.data ?? []}
          providersError={providers.error?.message}
        />
      ) : configuration.error ? (
        <p className="text-sm text-destructive">{configuration.error.message}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Loading active model…</p>
      )}
    </div>
  );
}

function ModelsSettingsContent({
  configuration,
  providers,
  providersError,
}: {
  configuration: LanguageModelConfiguration;
  providers: ProviderDefinition[];
  providersError?: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [searchParams] = useSearchParams();
  const requestedProvider = searchParams.get('provider');
  const requestedPreset = configuration.presets.find(
    (preset) => preset.id === requestedProvider || preset.provider === requestedProvider,
  );
  const initialPreset = requestedPreset ?? resolveActivePreset(configuration);
  const [presetId, setPresetId] = useState(initialPreset?.id ?? configuration.provider);
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
  const [refreshResult, setRefreshResult] = useState<ProviderModelRefreshResult>();
  const [handshakeResult, setHandshakeResult] = useState<ProviderHandshake>();
  const [authInstructions, setAuthInstructions] = useState('');
  const selectedPreset = configuration.presets.find((preset) => preset.id === presetId);

  // The service is the source of truth for this panel, so a configuration it
  // reports while the panel is open replaces what the panel is showing — unless
  // the person is part-way through setting something, which a refetch must
  // never throw away.
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
  const selectedProvider = providers.find(
    (provider) => provider.id === selectedPreset?.id || provider.id === selectedPreset?.provider,
  );
  const selectedAvailability = providerAvailability(selectedProvider, selectedPreset);
  const supportsRuntimeControls = Boolean(
    selectedPreset && ['vllm', 'lm_studio', 'ollama'].includes(selectedPreset.provider),
  );
  const providerReadyForApply = Boolean(
    selectedPreset &&
      (selectedPreset.is_authenticated ||
        (selectedPreset.requires_api_key && values.apiKey) ||
        selectedPreset.auth_method === 'none'),
  );
  const models = useQuery({
    queryKey: queryKeys.key('provider-models', settings.endpoint, presetId),
    queryFn: ({ signal }) => repository.providerModels(presetId, signal),
    enabled: Boolean(presetId && selectedPreset?.is_authenticated),
  });
  const modelOptions = useMemo(() => {
    const catalog = models.data?.models ?? [];
    if (catalog.length) return catalog;
    return [...new Set([values.modelId, selectedPreset?.suggested_model].filter(Boolean))].map(
      (id) => ({ id: id as string, name: id as string }),
    );
  }, [models.data?.models, selectedPreset?.suggested_model, values.modelId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedPreset || !values.modelId) throw new Error('Choose a provider and model first.');
      return repository.updateLanguageModelConfiguration(
        modelSettingsUpdate({ preset: selectedPreset, seeded, values }),
      );
    },
    onSuccess: async (next) => {
      // What was applied is now the service's own state, so the panel goes back
      // to following it.
      setEdited(false);
      queryClient.setQueryData(
        queryKeys.key('language-model-configuration', settings.endpoint),
        next,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('capabilities', settings.endpoint),
      });
    },
  });
  const refreshModels = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      const results = await repository.refreshProviderModels([presetId]);
      const result = results[0];
      if (!result) throw new Error('The service returned no catalog result for this provider.');
      return result;
    },
    onSuccess: async (result) => {
      setRefreshResult(result);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('provider-models', settings.endpoint, presetId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('capabilities', settings.endpoint),
        }),
      ]);
    },
  });
  const handshake = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.providerHandshake(presetId, {
        apiBase: values.apiBase,
        refresh: true,
      });
    },
    onSuccess: setHandshakeResult,
  });
  const authenticate = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.authenticateProvider(presetId);
    },
    onSuccess: (result) => setAuthInstructions(result.instructions),
  });

  return (
    <>
      <ClioSettingsSection
        description={
          configuration.thinking_level
            ? `New sessions start with ${readableState(configuration.thinking_level)} reasoning.`
            : "Uses the provider's standard reasoning level."
        }
        footer={
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!providerReadyForApply || !values.modelId || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? 'Applying…' : 'Apply provider and model'}
              </Button>
              {selectedPreset?.auth_method === 'oauth' ? (
                <Button
                  disabled={authenticate.isPending}
                  onClick={() => authenticate.mutate()}
                  variant="outline"
                >
                  <KeyRoundIcon aria-hidden="true" />
                  {authenticate.isPending
                    ? 'Opening sign-in…'
                    : `Sign in to ${providerDisplayName(selectedPreset)}`}
                </Button>
              ) : null}
              <Button
                disabled={!presetId || refreshModels.isPending}
                onClick={() => refreshModels.mutate()}
                variant="outline"
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={refreshModels.isPending ? 'animate-spin' : undefined}
                />
                {refreshModels.isPending ? 'Checking available models…' : 'Refresh model catalog'}
              </Button>
              <Button
                disabled={!presetId || handshake.isPending}
                onClick={() => handshake.mutate()}
                variant="outline"
              >
                <RadioTowerIcon aria-hidden="true" />
                {handshake.isPending ? 'Checking provider…' : 'Check provider'}
              </Button>
              {selectedPreset ? (
                <ClioStatus
                  detail={selectedAvailability.detail}
                  label={selectedAvailability.label}
                  value={selectedAvailability.value}
                />
              ) : null}
            </div>
            {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
            {refreshModels.error ? (
              <p className="text-sm text-destructive">{refreshModels.error.message}</p>
            ) : null}
            {handshake.error ? (
              <p className="text-sm text-destructive">{handshake.error.message}</p>
            ) : null}
            {authenticate.error ? (
              <p className="text-sm text-destructive">{authenticate.error.message}</p>
            ) : null}
            {authInstructions ? (
              <p className="max-w-3xl text-sm text-muted-foreground">{authInstructions}</p>
            ) : null}
            {refreshResult ? <RefreshResult result={refreshResult} /> : null}
            {handshakeResult ? <HandshakeResult result={handshakeResult} /> : null}
          </>
        }
        title="Provider and model"
      >
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
                  apiKey: '',
                  modelId: active ? configuration.model : (preset?.suggested_model ?? ''),
                });
                setRefreshResult(undefined);
                setHandshakeResult(undefined);
                setAuthInstructions('');
              }}
              value={presetId}
            >
              <SelectTrigger id="provider-choice">
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {configuration.presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate">{providerDisplayName(preset)}</span>
                      {!preset.is_authenticated ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Sign-in needed
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription title={selectedPreset?.description}>
              {providerSummary(selectedPreset)}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="model-choice">Model</FieldLabel>
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
                  <SelectItem key={model.id} value={model.id}>
                    {model.name ?? ('label' in model ? model.label : undefined) ?? model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription title={models.isError ? models.error.message : models.data?.source}>
              {models.isError
                ? 'Available models could not be loaded. Retry the catalog check or keep the suggested model.'
                : models.data?.source
                  ? 'Available models were checked by the connected agent.'
                  : 'Using the configured model.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="model-effort">Reasoning effort</FieldLabel>
            <Select
              onValueChange={(value) => edit({ effort: value as ReasoningEffort })}
              value={values.effort || undefined}
            >
              <SelectTrigger id="model-effort">
                <SelectValue placeholder="Provider default" />
              </SelectTrigger>
              <SelectContent>
                {REASONING_EFFORTS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {reasoningEffortLabel(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {values.effort
                ? 'This becomes the reasoning depth used for new work with this model.'
                : 'No reasoning depth is recorded for this model, so the provider uses its own until one is set here.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="provider-api-base">Endpoint / API base</FieldLabel>
            <Input
              autoComplete="url"
              id="provider-api-base"
              onChange={(event) => edit({ apiBase: event.target.value })}
              placeholder="http://127.0.0.1:8000/v1"
              value={values.apiBase}
            />
            <FieldDescription>
              {selectedPreset?.provider === 'vllm'
                ? 'Set the vLLM host and port here, including the OpenAI-compatible /v1 path.'
                : 'The connected service will use this endpoint for the selected provider.'}
            </FieldDescription>
          </Field>
          {selectedPreset?.requires_api_key ? (
            <Field>
              <FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
              <Input
                autoComplete="off"
                id="provider-api-key"
                onChange={(event) => edit({ apiKey: event.target.value })}
                placeholder={
                  selectedPreset.is_authenticated
                    ? 'Leave blank to keep the configured credential'
                    : 'Enter a provider API key'
                }
                type="password"
                value={values.apiKey}
              />
              <FieldDescription>
                Credentials are sent to the connected CLIO backend and are never read back into the
                browser.
              </FieldDescription>
            </Field>
          ) : null}
          {supportsRuntimeControls ? (
            <>
              <Field>
                <FieldLabel htmlFor="provider-parallel">Parallel model slots</FieldLabel>
                <Input
                  id="provider-parallel"
                  min={0}
                  onChange={(event) => edit({ parallel: event.target.value })}
                  placeholder="Runtime default"
                  type="number"
                  value={values.parallel}
                />
                <FieldDescription>
                  The service does not report this back, so it starts empty and an empty field
                  leaves the runtime sizing untouched. Set it only when the local runtime has
                  capacity to spare.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="provider-context-length">Context length</FieldLabel>
                <Input
                  id="provider-context-length"
                  min={0}
                  onChange={(event) => edit({ contextLength: event.target.value })}
                  placeholder="Runtime default"
                  type="number"
                  value={values.contextLength}
                />
                <FieldDescription>
                  Empty keeps the runtime-discovered or deployment default context window.
                </FieldDescription>
              </Field>
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="provider-max-tokens">Maximum output tokens</FieldLabel>
            <Input
              id="provider-max-tokens"
              min={1}
              onChange={(event) => edit({ maxTokens: event.target.value })}
              placeholder="Provider default"
              type="number"
              value={values.maxTokens}
            />
            <FieldDescription>
              Empty means no cap is recorded for this model and the provider applies its own.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="provider-temperature">Temperature</FieldLabel>
            <Input
              id="provider-temperature"
              max={2}
              min={0}
              onChange={(event) => edit({ temperature: event.target.value })}
              placeholder="Provider default"
              step={0.1}
              type="number"
              value={values.temperature}
            />
            <FieldDescription>
              Applying these settings also makes this provider and model the backend default for new
              work.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </ClioSettingsSection>
      <ClioSettingsSection
        description="Authentication and capability state reported by the service."
        title="Provider availability"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((provider) => {
            const preset = configuration.presets.find(
              (item) => item.id === provider.id || item.provider === provider.id,
            );
            const availability = providerAvailability(provider, preset);
            return (
              <div className="rounded-lg border p-3" key={provider.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {providerDisplayName(preset, provider.name)}
                    </p>
                    <p
                      className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
                      title={provider.description}
                    >
                      {providerSummary(preset, provider.name)}
                    </p>
                    {availability.detail ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {availability.detail}
                      </p>
                    ) : null}
                  </div>
                  <ClioStatus
                    className="shrink-0"
                    label={availability.label}
                    value={availability.value}
                  />
                </div>
              </div>
            );
          })}
          {providersError ? (
            <p className="p-3 text-sm text-destructive sm:col-span-2">{providersError}</p>
          ) : null}
          {!providers.length && !providersError ? (
            <p className="p-3 text-sm text-muted-foreground sm:col-span-2">
              No provider details were reported by the service.
            </p>
          ) : null}
        </div>
      </ClioSettingsSection>
    </>
  );
}

function HandshakeResult({ result }: { result: ProviderHandshake }) {
  const healthy =
    result.connectivity === 'ok' && ['ok', 'not_required', 'deferred'].includes(result.auth);
  return (
    <div className="grid gap-1 text-sm">
      <ClioStatus
        label={healthy ? 'Provider ready' : 'Provider needs attention'}
        value={healthy ? 'healthy' : 'degraded'}
      />
      <p className="text-muted-foreground">
        {result.error ??
          `Connection ${readableState(result.connectivity)}, sign-in ${readableState(result.auth)}, ${result.models.length} model${result.models.length === 1 ? '' : 's'}`}
      </p>
      <p className="text-xs text-muted-foreground" title={`Reported source: ${result.source}`}>
        {result.latency_ms === undefined
          ? `Checked ${readableTimestamp(result.generated_at)} by the connected agent.`
          : `Checked ${readableTimestamp(result.generated_at)} in ${Math.round(result.latency_ms)} ms.`}
      </p>
    </div>
  );
}

function readableState(value: string) {
  return value.replaceAll('_', ' ');
}

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function reasoningEffortLabel(level: ReasoningEffort): string {
  return REASONING_EFFORT_LABELS[level];
}

function RefreshResult({ result }: { result: ProviderModelRefreshResult }) {
  return (
    <div className="grid gap-1 text-sm">
      <ClioStatus
        label={result.failed_reason ? 'Catalog check failed' : 'Catalog refreshed'}
        value={result.failed_reason ? 'degraded' : 'healthy'}
      />
      <p className="text-muted-foreground">
        {result.failed_reason ??
          `${result.discovered.length} available model${result.discovered.length === 1 ? '' : 's'}, ${result.added.length} added, ${result.removed.length} removed`}
      </p>
      <p className="text-xs text-muted-foreground" title={`Reported source: ${result.source}`}>
        Checked {readableTimestamp(result.generated_at)} by the connected agent.
      </p>
    </div>
  );
}

function readableTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? 'at an unavailable time'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        timestamp,
      );
}
