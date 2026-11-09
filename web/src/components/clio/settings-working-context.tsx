import type { ContextControls } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import { formatTokens, modelEffectiveContext } from './context-control-model';
import { SaveBar } from './primitives/save-bar';
import { SettingsChoice, SettingsRow } from './settings-row';
import { useWorkingContext, type WorkingContextState } from './use-working-context';

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
