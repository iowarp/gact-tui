import type { ContextControls } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  contextDraftError,
  formatTokens,
  modelContextDraft,
  modelEffectiveContext,
  type ContextDraft,
} from './context-control-model';
import { SaveBar } from './primitives/save-bar';
import { SettingsChoice, SettingsRow } from './settings-row';

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

/**
 * Context length as one setting row: Max or a typed number, the context in
 * force under the label. A change applies from the next turn.
 */
export function WorkingContextRow({ state }: { state: WorkingContextState }) {
  const { current, value, draft, setDraft, error, saving } = state;
  const effective = modelEffectiveContext(current);
  const inForce = effective
    ? `In force: ${
        effective.length !== undefined
          ? `${formatTokens(effective.length)} tokens`
          : 'the engine’s own default'
      }${effective.reason ? ` (${effective.reason})` : ''}`
    : undefined;
  const shown =
    value.choice === 'number'
      ? value.tokens
      : value.choice === 'max' && current.maximum !== undefined
        ? String(current.maximum)
        : '';
  return (
    <SettingsRow
      dirty={Boolean(draft)}
      error={error}
      htmlFor="working-context-tokens"
      info={`How much of the conversation this model is given each turn. Compaction keeps the conversation within it. A change applies from the next turn.${
        current.maximum_reason ? ` Max: ${current.maximum_reason}.` : ''
      }`}
      note={<span data-slot="context-effective">{inForce ?? 'Max: the model’s maximum.'}</span>}
      title="Context length"
    >
      <SettingsChoice
        id="working-context-choice"
        label="Context length choice"
        onChange={(choice) =>
          setDraft(
            choice === 'max'
              ? { choice: 'max', tokens: '', strategy: '' }
              : {
                  choice: 'number',
                  tokens: value.tokens || String(current.current ?? current.maximum ?? ''),
                  strategy: '',
                },
          )
        }
        options={[
          { value: 'max', label: 'Max', description: 'The model’s maximum' },
          { value: 'number', label: 'Number', description: 'A typed number of tokens' },
        ]}
        value={value.choice === 'number' ? 'number' : 'max'}
      />
      <Input
        aria-invalid={error ? true : undefined}
        className="h-[1.875rem] w-28 shrink-0 text-[0.78125rem] tabular-nums"
        disabled={saving}
        id="working-context-tokens"
        inputMode="numeric"
        max={current.maximum}
        min={current.minimum}
        onChange={(event) =>
          setDraft({ choice: 'number', tokens: event.target.value, strategy: '' })
        }
        placeholder="Tokens"
        step={1}
        type="number"
        value={shown}
      />
    </SettingsRow>
  );
}

/** The working context on its own, with its own save bar. */
export function SettingsWorkingContext(props: {
  providerId: string;
  modelId: string;
  seed: ContextControls;
}) {
  const state = useWorkingContext(props);
  return (
    <section aria-label="Working context" data-slot="working-context">
      <WorkingContextRow state={state} />
      <SaveBar
        count={state.draft ? 1 : 0}
        error={state.saveError}
        invalid={Boolean(state.error)}
        onDiscard={() => state.setDraft(undefined)}
        onSave={state.save}
        saving={state.saving}
      />
    </section>
  );
}