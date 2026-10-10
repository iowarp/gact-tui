import type { ContextControls } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ContextControl } from './context-control';
import {
  contextDraftError,
  modelContextDraft,
  modelEffectiveContext,
  type ContextDraft,
} from './context-control-model';
import { InfoTip } from './info-tip';

/**
 * The working context of a model CLIO binds but does not run: what the agent
 * loop and auto-compaction budget against, bounded by the model's reported
 * maximum. The same context control as a managed deployment; Fit to GPU
 * appears only if the service offers it (it does not for a bound model).
 */
export function SettingsWorkingContext({
  providerId,
  modelId,
  seed,
}: {
  providerId: string;
  modelId: string;
  /** The catalog row's `context_controls`, shown until the live control answers. */
  seed: ContextControls;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const queryKey = queryKeys.key('working-context', settings.endpoint, providerId, modelId);
  const controls = useQuery({
    queryKey,
    queryFn: ({ signal }) => repository.workingContext(providerId, modelId, '', signal),
    placeholderData: seed,
    staleTime: 30_000,
  });
  const current = controls.data ?? seed;
  const [draft, setDraft] = useState<ContextDraft>();
  const value = draft ?? modelContextDraft(current);
  const save = useMutation({
    mutationFn: (next: ContextDraft) =>
      repository.saveWorkingContext(providerId, {
        model: modelId,
        choice: next.choice === 'number' ? 'number' : 'max',
        tokens: next.choice === 'number' ? Number(next.tokens) : undefined,
      }),
    onSuccess: (saved) => {
      client.setQueryData(queryKey, saved);
      setDraft(undefined);
      void client.invalidateQueries({ queryKey: queryKeys.providerCatalog(settings.endpoint) });
    },
  });
  const invalid = Boolean(
    contextDraftError(value, { minimum: current.minimum, maximum: current.maximum }),
  );
  return (
    <section
      aria-label="Working context"
      className="flex flex-col gap-3"
      data-slot="working-context"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Working context
        <InfoTip label="About working context">
          How much of the conversation this model is given each turn. Compaction keeps the
          conversation within it. A change applies from the next turn.
        </InfoTip>
      </h3>
      <ContextControl
        defaultDescription="Max: the model’s maximum."
        disabled={save.isPending}
        draft={value}
        effective={modelEffectiveContext(current)}
        fitToGpu={{
          available: current.fit_to_gpu.available,
          strategies: current.fit_to_gpu.strategies,
          defaultStrategy: current.fit_to_gpu.strategy,
          value: current.fit_to_gpu.value,
        }}
        id="working-context"
        label="Context length"
        maximum={current.maximum}
        maximumReason={current.maximum_reason}
        minimum={current.minimum}
        onDraft={setDraft}
      />
      {save.error ? (
        <p className="text-sm text-destructive" role="alert">
          {save.error.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          disabled={!draft || invalid || save.isPending}
          onClick={() => draft && save.mutate(draft)}
          size="sm"
          type="button"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </section>
  );
}
