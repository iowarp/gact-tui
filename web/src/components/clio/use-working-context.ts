import type { ContextControls } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { contextDraftError, modelContextDraft, type ContextDraft } from './context-control-model';

export interface WorkingContextState {
  current: ContextControls;
  draft: ContextDraft | undefined;
  value: ContextDraft;
  setDraft: (next: ContextDraft | undefined) => void;
  error: string | undefined;
  saving: boolean;
  saveError: string | undefined;
  save: () => void;
}

/**
 * The working context of a model CLIO binds but does not run: what the agent
 * loop and auto-compaction budget against, bounded by the model's reported
 * maximum. The page holds the draft so its one save bar can carry it.
 */
export function useWorkingContext({
  providerId,
  modelId,
  seed,
}: {
  providerId: string;
  modelId: string;
  /** The catalog row's `context_controls`, shown until the live control answers. */
  seed: ContextControls;
}): WorkingContextState {
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
  const mutation = useMutation({
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
  const error = contextDraftError(value, { minimum: current.minimum, maximum: current.maximum });
  return {
    current,
    draft,
    value,
    setDraft,
    error,
    saving: mutation.isPending,
    saveError: mutation.error?.message,
    save: () => {
      if (draft && !error) mutation.mutate(draft);
    },
  };
}
