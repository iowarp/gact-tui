import { queryKeys } from '@/lib/query-keys';
import type { LanguageModelConfiguration, ProviderDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DownloadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  RadioTowerIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
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
import { readProviderCredential, storeProviderCredential } from '@/tauri/secure-credentials';
import { providerDisplayName, providerSummary } from '@/lib/provider-presentation';
import { clearCachedSessionModelReferences } from '@/lib/session-model-state';
import { useLiveStore } from '@/store/live-store';
import { vocab } from '@/lib/brand-vocabulary';
import { openExternalUrl } from '@/tauri/external-url';
import { useProviderSettingsActions } from './settings-models-actions';
import { useProviderCatalog } from '@/hooks/use-provider-catalog';
import { modelReasoningLevels } from '@/lib/reasoning-levels';
import {
  canApplyProvider,
  modelSettingsOptions,
  modelSettingsUpdate,
  presetIsActive,
  providerSupportsRuntimeSizing,
  resolveActivePreset,
  seedModelSettings,
  type ModelSettingsValues,
  type ReasoningEffort,
} from './settings-models-form';
import { ClioSettingsSection } from './settings-section';
import { SettingsSectionHeading } from './settings-section-heading';
import { HandshakeResult, RefreshResult } from './settings-models-results';
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
  const clearSessionModelReferences = useLiveStore((state) => state.clearSessionModelReferences);
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
  const selectedPreset = configuration.presets.find((preset) => preset.id === presetId);

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
  const selectedAvailability = providerAvailability(selectedProvider, selectedPreset);
  const supportsRuntimeControls = providerSupportsRuntimeSizing(selectedPreset);
  const providerReadyForApply = canApplyProvider(selectedPreset, values, storedCredential.data);
  const providerCatalog = useProviderCatalog();
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
  // Only the levels this model's provider reports for it (empty: no selector).
  const reasoningLevels =
    modelReasoningLevels(
      providerCatalog.data?.providers
        .find((provider) => provider.id === presetId)
        ?.models.find((model) => model.model_id === values.modelId)?.reasoning,
    )?.levels ?? [];
  const selectedModelIsCandidate = modelOptions.some(
    (model) => model.id === values.modelId && model.availability === 'candidate',
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedPreset || !values.modelId) throw new Error('Choose a provider and model first.');
      const update = modelSettingsUpdate({ preset: selectedPreset, seeded, values });
      if (selectedPreset.requires_api_key) {
        if (values.apiKey) {
          await storeProviderCredential(update.provider_id, update.api_base, values.apiKey);
          queryClient.setQueryData(
            ['provider-credential', update.provider_id, update.api_base],
            values.apiKey,
          );
        } else {
          const stored =
            storedCredential.data ??
            (await readProviderCredential(update.provider_id, update.api_base));
          if (stored) update.api_key = stored;
        }
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
  const {
    authFlow,
    authInstructions,
    authLaunchError,
    authenticate,
    authorizationCode,
    completeAuthentication,
    handshake,
    handshakeResult,
    installProvider,
    refreshModels,
    refreshResult,
    reset: resetProviderActions,
    setAuthLaunchError,
    setAuthorizationCode,
  } = useProviderSettingsActions({
    presetId,
    apiBase: values.apiBase,
    onDefaultModel: (modelId) => edit({ modelId }),
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
                disabled={
                  !providerReadyForApply ||
                  !values.modelId ||
                  selectedModelIsCandidate ||
                  save.isPending
                }
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
              {selectedPreset?.auth_method === 'oauth' && selectedPreset.auth_label ? (
                <span className="text-sm text-muted-foreground">
                  Uses {selectedPreset.auth_label}
                </span>
              ) : null}
              {selectedPreset?.provider === 'claude_code' &&
              selectedPreset.status === 'install_required' ? (
                <Button
                  disabled={installProvider.isPending}
                  onClick={() => installProvider.mutate()}
                  variant="outline"
                >
                  <DownloadIcon aria-hidden="true" />
                  {installProvider.isPending ? 'Installing Claude Code…' : 'Install Claude Code'}
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
            {installProvider.error ? (
              <p className="text-sm text-destructive">{installProvider.error.message}</p>
            ) : null}
            {authenticate.error ? (
              <p className="text-sm text-destructive">{authenticate.error.message}</p>
            ) : null}
            {authInstructions ? (
              <p className="max-w-3xl text-sm text-muted-foreground">{authInstructions}</p>
            ) : null}
            {authFlow ? (
              <div
                aria-label="Complete ALCF sign-in"
                className="grid max-w-xl gap-3 rounded-lg border border-border bg-muted/20 p-4"
              >
                <div>
                  <p className="font-medium">Finish signing in to ALCF</p>
                  <p className="text-sm text-muted-foreground">
                    Sign in with your ALCF identity. Globus will show a one-time code to paste
                    below; the connected {vocab.agent} stores the resulting token.
                  </p>
                </div>
                <Button
                  className="w-fit"
                  onClick={() => {
                    setAuthLaunchError('');
                    void openExternalUrl(authFlow.authorizationUrl).catch((error: unknown) =>
                      setAuthLaunchError(
                        error instanceof Error ? error.message : 'Could not open Globus sign-in.',
                      ),
                    );
                  }}
                  variant="outline"
                >
                  <ExternalLinkIcon aria-hidden="true" />
                  Open Globus sign-in
                </Button>
                {authLaunchError ? (
                  <p className="text-sm text-destructive">{authLaunchError}</p>
                ) : null}
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="alcf-authorization-code">
                    Authorization code
                  </label>
                  <Input
                    autoComplete="one-time-code"
                    id="alcf-authorization-code"
                    onChange={(event) => setAuthorizationCode(event.target.value)}
                    placeholder="Paste the code from Globus"
                    value={authorizationCode}
                  />
                </div>
                <Button
                  className="w-fit"
                  disabled={!authorizationCode.trim() || completeAuthentication.isPending}
                  onClick={() => completeAuthentication.mutate()}
                >
                  {completeAuthentication.isPending ? 'Completing sign-in…' : 'Complete sign-in'}
                </Button>
                {completeAuthentication.error ? (
                  <p className="text-sm text-destructive">{completeAuthentication.error.message}</p>
                ) : null}
              </div>
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
                  providerOptions: active ? (configuration.provider_options ?? {}) : {},
                });
                resetProviderActions();
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
                          {preset.status === 'install_required'
                            ? 'Install needed'
                            : preset.status === 'auth_check_required'
                              ? 'Check required'
                              : 'Sign-in needed'}
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
                  <SelectItem
                    disabled={model.availability === 'candidate'}
                    key={model.id}
                    value={model.id}
                  >
                    {model.name ?? ('label' in model ? model.label : undefined) ?? model.id}
                    {model.availability === 'candidate' ? ' (check provider to verify)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription title={models.isError ? models.error.message : models.data?.source}>
              {models.isError
                ? 'Available models could not be loaded. Retry the catalog check or keep the suggested model.'
                : models.data?.source === 'static_catalog'
                  ? 'Candidate models only; check the provider to verify account availability.'
                  : models.data?.staleness
                    ? 'Previously discovered models; check the provider to verify current availability.'
                    : models.data?.source
                      ? 'Available models were checked by the connected agent.'
                      : 'Using the configured model.'}
            </FieldDescription>
          </Field>
          {reasoningLevels.length ? (
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
                  {reasoningLevels.map((level) => (
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
          ) : null}
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
              {(selectedPreset?.provider_id ?? selectedPreset?.id) === 'vllm'
                ? 'Set the vLLM host and port here, including the OpenAI-compatible /v1 path.'
                : 'The connected service will use this endpoint for the selected provider.'}
            </FieldDescription>
          </Field>
          {(selectedPreset?.configuration_fields ?? []).map((field) => (
            <Field key={field.id}>
              <FieldLabel htmlFor={`provider-option-${field.id}`}>{field.label}</FieldLabel>
              <Input
                id={`provider-option-${field.id}`}
                onChange={(event) =>
                  edit({
                    providerOptions: {
                      ...values.providerOptions,
                      [field.id]: event.target.value,
                    },
                  })
                }
                placeholder={field.placeholder}
                required={field.required}
                value={values.providerOptions[field.id] ?? ''}
              />
              {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
            </Field>
          ))}
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
                Credentials are sent to the connected {vocab.agent} backend and are never read back
                into the browser.
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

function readableState(value: string) {
  return value.replaceAll('_', ' ');
}

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
};

function reasoningEffortLabel(level: ReasoningEffort): string {
  return REASONING_EFFORT_LABELS[level];
}
