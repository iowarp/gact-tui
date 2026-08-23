import type {
  LanguageModelConfiguration,
  LanguageModelPreset,
  ProviderDefinition,
  ProviderHandshake,
  ProviderModelRefreshResult,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioTowerIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
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
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

function resolveActivePreset(
  configuration: LanguageModelConfiguration,
): LanguageModelPreset | undefined {
  return (
    configuration.presets.find(
      (preset) =>
        preset.provider === configuration.provider &&
        (!preset.api_base || preset.api_base === configuration.api_base),
    ) ?? configuration.presets.find((preset) => preset.id === configuration.provider)
  );
}

export function ModelsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const providers = useQuery({
    queryKey: ['providers', settings.endpoint],
    queryFn: ({ signal }) => repository.providers(signal),
  });
  const configuration = useQuery({
    queryKey: ['language-model-configuration', settings.endpoint],
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
  const activePreset = resolveActivePreset(configuration);
  const [presetId, setPresetId] = useState(activePreset?.id ?? configuration.provider);
  const [modelId, setModelId] = useState(configuration.model);
  const initialEffort = ['off', 'low', 'medium', 'high'].includes(
    configuration.thinking_level ?? '',
  )
    ? (configuration.thinking_level as 'off' | 'low' | 'medium' | 'high')
    : 'medium';
  const [effort, setEffort] = useState(initialEffort);
  const [refreshResult, setRefreshResult] = useState<ProviderModelRefreshResult>();
  const [handshakeResult, setHandshakeResult] = useState<ProviderHandshake>();
  const selectedPreset = configuration.presets.find((preset) => preset.id === presetId);
  const models = useQuery({
    queryKey: ['provider-models', settings.endpoint, presetId],
    queryFn: ({ signal }) => repository.providerModels(presetId, signal),
    enabled: Boolean(presetId && selectedPreset?.is_authenticated),
  });
  const modelOptions = useMemo(() => {
    const catalog = models.data?.models ?? [];
    if (catalog.length) return catalog;
    return [...new Set([modelId, selectedPreset?.suggested_model].filter(Boolean))].map((id) => ({
      id: id as string,
      name: id as string,
    }));
  }, [modelId, models.data?.models, selectedPreset?.suggested_model]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedPreset || !modelId) throw new Error('Choose a provider and model first.');
      return repository.updateLanguageModelConfiguration({
        provider: selectedPreset.provider,
        api_base: selectedPreset.api_base ?? '',
        model: modelId,
        thinking_level: effort,
      });
    },
    onSuccess: async (next) => {
      queryClient.setQueryData(['language-model-configuration', settings.endpoint], next);
      await queryClient.invalidateQueries({ queryKey: ['capabilities', settings.endpoint] });
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
          queryKey: ['provider-models', settings.endpoint, presetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['language-model-configuration', settings.endpoint],
        }),
        queryClient.invalidateQueries({ queryKey: ['capabilities', settings.endpoint] }),
      ]);
    },
  });
  const handshake = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.providerHandshake(presetId, {
        apiBase: selectedPreset?.api_base,
        refresh: true,
      });
    },
    onSuccess: setHandshakeResult,
  });

  return (
    <>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Default model</FrameTitle>
          <FrameDescription>
            {configuration.thinking_effective ?? 'Active model settings from the service.'}
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="provider-choice">Provider</FieldLabel>
              <Select
                onValueChange={(value) => {
                  setPresetId(value);
                  const preset = configuration.presets.find((item) => item.id === value);
                  setModelId(preset?.suggested_model ?? '');
                  setRefreshResult(undefined);
                  setHandshakeResult(undefined);
                }}
                value={presetId}
              >
                <SelectTrigger id="provider-choice">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {configuration.presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                      {preset.is_authenticated ? '' : ' — sign-in needed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {selectedPreset?.description ?? 'Provider details unavailable.'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="model-choice">Model</FieldLabel>
              <Select
                disabled={!presetId || models.isFetching}
                onValueChange={setModelId}
                value={modelId}
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
              <FieldDescription>
                {models.isError
                  ? `Live catalog unavailable: ${models.error.message}`
                  : models.data?.source
                    ? `Catalog source: ${models.data.source}`
                    : 'Using the configured model.'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="model-effort">Reasoning effort</FieldLabel>
              <Select onValueChange={(value) => setEffort(value as typeof effort)} value={effort}>
                <SelectTrigger id="model-effort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                This becomes the reasoning depth used for new work with this model.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FramePanel>
        <FrameFooter className="items-start">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!selectedPreset?.is_authenticated || !modelId || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save default'}
            </Button>
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
                label={selectedPreset.is_authenticated ? 'Ready' : 'Sign-in needed'}
                value={selectedPreset.is_authenticated ? 'healthy' : 'unavailable'}
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
          {refreshResult ? <RefreshResult result={refreshResult} /> : null}
          {handshakeResult ? <HandshakeResult result={handshakeResult} /> : null}
        </FrameFooter>
      </Frame>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Provider availability</FrameTitle>
          <FrameDescription>
            Authentication and capability state reported by the service.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-2 p-2 sm:grid-cols-2">
          {providers.map((provider) => (
            <div className="rounded-lg border p-3" key={provider.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {provider.description}
                  </p>
                </div>
                <ClioStatus
                  className="shrink-0"
                  label={provider.is_authenticated ? 'Ready' : 'Sign-in needed'}
                  value={provider.is_authenticated ? 'healthy' : 'unavailable'}
                />
              </div>
            </div>
          ))}
          {providersError ? (
            <p className="p-3 text-sm text-destructive sm:col-span-2">{providersError}</p>
          ) : null}
          {!providers.length && !providersError ? (
            <p className="p-3 text-sm text-muted-foreground sm:col-span-2">
              No provider details were reported by the service.
            </p>
          ) : null}
        </FramePanel>
      </Frame>
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
      <p className="font-mono text-[10px] text-muted-foreground">
        {result.latency_ms === undefined
          ? 'Latency unavailable'
          : `${Math.round(result.latency_ms)} ms`}{' '}
        , source {result.source}, checked {result.generated_at}
      </p>
    </div>
  );
}

function readableState(value: string) {
  return value.replaceAll('_', ' ');
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
      <p className="font-mono text-[10px] text-muted-foreground">
        Source {result.source}, checked {result.generated_at}
      </p>
    </div>
  );
}
