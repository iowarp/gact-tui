import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Under the composer: the chosen model lacks what this conversation's agent
 * requires (image input for its PDF reader, say). Sending would be refused
 * with the same reason, so the notice says it first and names what fits.
 */
export function ModelFitNotice({
  sessionId,
  providerId,
  modelId,
}: {
  sessionId: string;
  providerId?: string;
  modelId?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.fleet({ sessionId }, signal),
    staleTime: 30_000,
  });
  const entry = fleet.data?.entries.find(
    (row) => row.account === providerId && row.model === modelId,
  );
  if (!entry?.fit || entry.fit.meets) return null;
  const fitting = (fleet.data?.entries ?? [])
    .filter((row) => row.available && row.fit?.meets)
    .map((row) => row.model);
  return (
    <div className="px-3 pt-1 text-xs text-destructive" role="alert">
      {modelId} lacks {entry.fit.unmet.join('; ')}.{' '}
      {fitting.length
        ? `Choose a model that has it: ${fitting.slice(0, 4).join(', ')}${fitting.length > 4 ? '…' : ''}.`
        : 'No connected model has it.'}
    </div>
  );
}
