import type { OfferListChoice } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The plugins and connectors the agent may offer, with the person's ticks. */
export function useOfferList(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('offer-list', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.offerList(signal),
    enabled,
  });
}

/** Saves the ticks; an empty choice is the default list, so it resets instead. */
export function useSaveOfferList() {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  return useMutation({
    mutationFn: (choice: OfferListChoice) =>
      choice.include.length || choice.exclude.length
        ? repository.saveOfferList(choice)
        : repository.resetOfferList(),
    onSuccess: (list) =>
      client.setQueryData(
        queryKeys.key('offer-list', settings.endpoint, connectionScope(settings)),
        list,
      ),
  });
}
