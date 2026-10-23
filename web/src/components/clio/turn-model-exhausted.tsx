import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { resetsIn } from '@/lib/fleet-usage';
import type { ModelExhausted } from '@/lib/turn-model-exhausted';

/**
 * The person's choice after their model's usage window ran out: when it
 * resets, and the connected models that can answer now. Nothing changes until
 * they pick one; picking retries this turn on it.
 */
export function TurnModelExhausted({
  sessionId,
  messageId,
  exhausted,
}: {
  sessionId: string;
  messageId: string;
  exhausted: ModelExhausted;
}) {
  const repository = useRepository();
  const retry = useMutation({
    mutationFn: (ref: string) => {
      const [providerId, ...rest] = ref.split('/');
      return repository.retryTurn(sessionId, messageId, {
        execute: true,
        provider_id: providerId,
        model_id: rest.join('/'),
      });
    },
  });
  const when = exhausted.resetsAt ? resetsIn(exhausted.resetsAt) : '';
  return (
    <div className="mt-2 grid gap-2" data-slot="turn-model-exhausted">
      <p className="text-sm">
        {exhausted.model} has used its window{when ? `; it ${when}` : ''}.
        {exhausted.alternatives.length
          ? ' Answer this turn on another model:'
          : ' No other connected model can answer now.'}
      </p>
      {exhausted.alternatives.length ? (
        <div className="flex flex-wrap gap-1.5">
          {exhausted.alternatives.map((ref) => (
            <Button
              disabled={retry.isPending}
              key={ref}
              onClick={() => retry.mutate(ref)}
              size="xs"
              variant="outline"
            >
              {ref.split('/').slice(1).join('/') || ref}
            </Button>
          ))}
        </div>
      ) : null}
      {retry.error ? (
        <p className="text-sm text-destructive" role="alert">
          {retry.error.message}
        </p>
      ) : null}
    </div>
  );
}
