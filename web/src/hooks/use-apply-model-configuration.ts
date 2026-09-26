import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ModelSettingsUpdate } from '@/components/clio/settings-models-form';
import { queryKeys } from '@/lib/query-keys';
import { clearCachedSessionModelReferences } from '@/lib/session-model-state';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { readProviderCredential } from '@/tauri/secure-credentials';
import { useRepository } from './use-repository';

/**
 * The ONE way a surface makes a provider and model the service's default
 * (`PUT /v1/providers/lm`): forwards a stored key for a key provider, then
 * adopts the new configuration and retires every cached answer that depended
 * on the old one (sessions' model refs, catalog, capabilities, defaults).
 * Settings > Models and Settings > Providers both apply through it.
 */
export function useApplyModelConfiguration(onApplied?: () => void) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const clearSessionModelReferences = useLiveStore((state) => state.clearSessionModelReferences);
  const { settings } = useConnectionSettings();
  return useMutation({
    mutationFn: async ({ update, requiresKey }: { update: ModelSettingsUpdate; requiresKey: boolean }) => {
      if (requiresKey && !update.api_key) {
        const stored = await readProviderCredential(update.provider_id, update.api_base);
        if (stored) update.api_key = stored;
      }
      return repository.updateLanguageModelConfiguration(update);
    },
    onSuccess: async (next) => {
      onApplied?.();
      queryClient.setQueryData(queryKeys.key('language-model-configuration', settings.endpoint), next);
      clearCachedSessionModelReferences(queryClient, settings.endpoint);
      clearSessionModelReferences();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.capabilities(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerModels(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerCatalog(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('sessions', settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('session-defaults', settings.endpoint) }),
      ]);
    },
  });
}
