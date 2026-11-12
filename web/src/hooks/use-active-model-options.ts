import type { Session } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { cachedModelFacts } from '@/components/clio/model-picker-fact-cache';
import { buildModelOptions } from '@/lib/model-options';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ModelCatalogStatus } from './use-model-catalog-status';
import { useProviderCatalog } from './use-provider-catalog';
import { useRepository } from './use-repository';
import type { useWorkspaceCapabilities } from './use-workspace-capabilities';

type WorkspaceCapabilities = ReturnType<typeof useWorkspaceCapabilities>;

/**
 * The conversation's provider, model and effort, and the model choices the
 * composer offers for them: the active provider's catalog joined with the
 * provider catalog and the configured presets.
 */
export function useActiveModelOptions({
  capabilities,
  modelConfiguration,
  session,
}: WorkspaceCapabilities & { session: Session | undefined }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // provider_id only -- never modelConfiguration.data?.provider, which is the
  // wire KIND ("openai") that nine presets share (bedrock, llama_cpp, ...),
  // not an identity (#1418).
  const activeProvider =
    session?.provider_id ??
    modelConfiguration.data?.provider_id ??
    capabilities.data?.active_model?.provider_id;
  const activeModel =
    session?.model_id ??
    modelConfiguration.data?.model ??
    capabilities.data?.active_model?.model_id;
  // Only a level a person chose for this session is sent with messages; the
  // configured global level is displayed by the composer and applied server-side.
  const activeEffort = session?.effort;
  // Only a level a person configured is named as such; a shipped default is
  // the model's (the composer labels it from the catalog).
  const configuredEffort =
    modelConfiguration.data?.thinking_level_source === 'user'
      ? modelConfiguration.data.thinking_level
      : undefined;
  const activePreset = modelConfiguration.data?.presets.find(
    (preset) => preset.id === activeProvider,
  );
  const activeCatalogProvider = activePreset?.id ?? activeProvider ?? '';
  const modelCatalogKey = useMemo(
    () => queryKeys.key('provider-models', settings.endpoint, activeCatalogProvider),
    [settings.endpoint, activeCatalogProvider],
  );
  const modelCatalog = useQuery({
    queryKey: modelCatalogKey,
    queryFn: ({ signal }) => repository.providerModels(activeCatalogProvider, signal),
    enabled: Boolean(activeCatalogProvider),
    notifyOnChangeProps: ['data'],
  });
  const providerCatalog = useProviderCatalog();
  const modelOptions = useMemo(
    () =>
      buildModelOptions({
        activeCatalogProvider,
        activeModel,
        activeProvider,
        catalogModels: modelCatalog.data?.models,
        providerCatalog: providerCatalog.data,
        presets: modelConfiguration.data?.presets ?? [],
      }),
    [
      activeCatalogProvider,
      activeModel,
      activeProvider,
      modelCatalog.data?.models,
      providerCatalog.data,
      modelConfiguration.data?.presets,
    ],
  );
  useEffect(() => {
    const selected = modelOptions.filter((option) => option.providerId === activeProvider);
    const timer = window.setTimeout(() => selected.forEach(cachedModelFacts), 0);
    return () => clearTimeout(timer);
  }, [modelOptions, activeProvider]);
  // Background fetches are added by useModelCatalogStatus in the picker's owner.
  const settledCatalogStatus =
    providerCatalog.refreshPending || (providerCatalog.isPending && !providerCatalog.data)
      ? 'loading'
      : providerCatalog.isError && !providerCatalog.data
        ? 'error'
        : 'ready';
  const providerCatalogKey = useMemo(
    () => queryKeys.providerCatalog(settings.endpoint),
    [settings.endpoint],
  );
  const modelCatalogStatus = useMemo<ModelCatalogStatus>(
    () => ({ settled: settledCatalogStatus, queryKeys: [providerCatalogKey, modelCatalogKey] }),
    [settledCatalogStatus, providerCatalogKey, modelCatalogKey],
  );
  return {
    activeEffort,
    activeModel,
    activeProvider,
    configuredEffort,
    modelCatalogStatus,
    modelOptions,
    providerCatalog,
  };
}
