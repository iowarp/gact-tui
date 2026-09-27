import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Re-check a provider the moment a surface loads it in a "needs sign-in"
 * state: the composer holding a pick on it, or the picker showing it (#1455).
 *
 * A sign-in made outside the app (Claude Code's own `claude auth login` in a
 * terminal) is invisible until something asks the provider again. This asks
 * once per provider per mounted surface -- a negotiation driven by the person
 * looking at the provider, never a timer -- and refreshes the provider list
 * and catalog so the new state shows everywhere.
 */
export function useHeldProviderRecheck(providerId: string | undefined): void {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!providerId || asked.current.has(providerId)) return;
    asked.current.add(providerId);
    void repository
      .providerHandshake(providerId, { refresh: true })
      .catch(() => undefined) // the provider keeps its "needs sign-in" state and says why
      .finally(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.providerCatalog(settings.endpoint),
        });
      });
  }, [providerId, queryClient, repository, settings.endpoint]);
}
