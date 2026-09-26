import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { providerGroupsFromOptions } from '@/components/clio/model-picker-model';
import { buildModelOptions } from '@/lib/model-options';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useProviderCatalog } from './use-provider-catalog';
import { useRepository } from './use-repository';

/**
 * Every provider the service reports, as the SAME `ProviderGroup` rows the
 * model picker lists (health, reason, usable models, transports), read from
 * the same cached configuration and provider-catalog queries -- so Settings
 * never shows a provider in a different state than an open picker does.
 * Unlike the picker's normal browse mode, it always includes presets that
 * have no catalog entry yet: Settings is where those get set up. `options`
 * are the model rows those groups were built from -- what a model picker
 * opened from Settings lists.
 */
export function useProviderGroups() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const catalog = useProviderCatalog();
  const presetsData = configuration.data?.presets;
  const presets = useMemo(() => presetsData ?? [], [presetsData]);
  const activeProvider = configuration.data?.provider_id;
  const activeModel = configuration.data?.model;
  const catalogData = catalog.data;
  const options = useMemo(
    () =>
      buildModelOptions({
        activeCatalogProvider: activeProvider ?? '',
        activeModel,
        activeProvider,
        providerCatalog: catalogData,
        presets,
      }),
    [activeModel, activeProvider, catalogData, presets],
  );
  const groups = useMemo(
    () => providerGroupsFromOptions(options, presets, true),
    [options, presets],
  );
  return { catalog, configuration, groups, options, presets };
}
