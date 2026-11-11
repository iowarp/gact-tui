import { Input } from '@/components/ui/input';
import { formatTokens, modelEffectiveContext } from './context-control-model';
import { SettingsChoice, SettingsRow } from './settings-row';
import type { WorkingContextState } from './use-working-context';

/**
 * Context size as one setting row: Max or a typed number. The context in force
 * shows under the label only when it differs from the field. A change applies
 * from the next turn.
 */
export function WorkingContextRow({ state }: { state: WorkingContextState }) {
  const { current, value, draft, setDraft, error, saving } = state;
  const effective = modelEffectiveContext(current);
  const shown =
    value.choice === 'number'
      ? value.tokens
      : value.choice === 'max' && current.maximum !== undefined
        ? String(current.maximum)
        : '';
  const inForce =
    effective?.length !== undefined && String(effective.length) !== shown
      ? effective.length
      : undefined;
  return (
    <SettingsRow
      dirty={Boolean(draft)}
      error={error}
      htmlFor="working-context-tokens"
      info={`How much of the conversation this model is given each turn. Compaction keeps the conversation within it. A change applies from the next turn.${
        current.maximum_reason ? ` Max: ${current.maximum_reason}.` : ' Max: the model’s maximum.'
      }`}
      note={
        inForce !== undefined ? (
          <span data-slot="context-effective" title={effective?.reason}>
            In force: {formatTokens(inForce)} tokens
          </span>
        ) : undefined
      }
      title="Context size"
    >
      <SettingsChoice
        id="working-context-choice"
        label="Context size choice"
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
