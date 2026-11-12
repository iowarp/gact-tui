import type { LanguageModelPreset } from '@clio/core/v3';
import { CpuIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useFleetSettings } from '@/hooks/use-fleet-settings';
import { vocab } from '@/lib/brand-vocabulary';
import type { ClioModelOption } from '@/lib/model-options';
import { FleetModelField } from './fleet-model-field';
import { SettingsSelectField } from './model-select-field';
import { SettingsChoice, SettingsRow } from './settings-row';

/** The provider option that streams a diffusion model's steps in place. */
export const SHOW_DIFFUSION = 'show_diffusion';

/** The short word beside a control this agent can't set (spec `.xdef`, faint). */
function NotOffered({ children = 'Not offered' }: { children?: ReactNode }) {
  return (
    <span
      className="shrink-0 text-label whitespace-nowrap text-faint"
      data-slot="settings-unavailable"
    >
      {children}
    </span>
  );
}

/**
 * Fast model: titles, summaries and other small calls, and every helper model
 * left unset. Unset uses the conversation account's own fast model. An older
 * agent without one reads as not offered.
 */
export function FastModelRow({
  options,
  catalogStatus,
  onRetryCatalog,
}: {
  options: ClioModelOption[];
  catalogStatus: 'loading' | 'error' | 'ready';
  onRetryCatalog: (providerId?: string) => void;
}) {
  const { query, save } = useFleetSettings();
  const data = query.data;
  if (!data || data.fast === undefined)
    return (
      <SettingsRow
        description="Titles, summaries and other small calls."
        info={
          data
            ? `This ${vocab.agent} version doesn't offer a separate fast model, so these calls use the default model.`
            : undefined
        }
        note={data ? 'Not offered by this agent' : undefined}
        title="Fast model"
      >
        <SettingsSelectField
          aria-label="Fast model"
          disabled
          icon={<CpuIcon />}
          placeholder={query.isPending ? 'Loading…' : 'Same as default model'}
          title={
            query.error ? query.error.message : `This ${vocab.agent} version has no fast model`
          }
        />
      </SettingsRow>
    );
  return (
    <SettingsRow
      description="Titles, summaries and other small calls. Helper models use it unless you choose one."
      htmlFor="settings-fast-model"
      info="Unset uses the fast model of the account the conversation runs on, such as Haiku for Claude."
      note={save.error?.message}
      title="Fast model"
    >
      <FleetModelField
        busy={save.isPending}
        catalogStatus={catalogStatus}
        choice={data.fast}
        id="settings-fast-model"
        label="Fast model"
        onChoose={(model) =>
          save.mutate({ ...data, fast: { provider_id: model.providerId, model_id: model.id } })
        }
        onReset={() => save.mutate({ ...data, fast: null })}
        onRetryCatalog={onRetryCatalog}
        options={options}
        pickerTitle="Choose the fast model"
        resetLabel="Use the account's fast model"
        unset="Account's fast model"
      />
    </SettingsRow>
  );
}

/**
 * Show diffusion: a switch over the provider's own `show_diffusion` option, so it
 * exists only for a provider that declares it. Elsewhere it reads as not offered.
 */
export function ShowDiffusionRow({
  preset,
  value,
  disabled,
  marker,
  onChange,
}: {
  preset: LanguageModelPreset | undefined;
  value: string | undefined;
  disabled: boolean;
  marker: ReactNode;
  onChange: (on: boolean) => void;
}) {
  const field = preset?.configuration_fields?.find((item) => item.id === SHOW_DIFFUSION);
  const on = (value || field?.placeholder || 'off') === 'on';
  return (
    <SettingsRow
      description="Redraw the reply in place while a diffusion model works."
      htmlFor="settings-show-diffusion"
      info={
        field
          ? 'Only the final answer is kept.'
          : 'The current provider has no diffusion models, so there is nothing to show.'
      }
      inlineControl
      note={field ? undefined : 'Not offered by the current provider'}
      title="Show diffusion"
    >
      <span className="flex items-center gap-2">
        {field ? marker : <NotOffered />}
        <Switch
          aria-label="Show diffusion"
          checked={field ? on : false}
          disabled={!field || disabled}
          id="settings-show-diffusion"
          onCheckedChange={onChange}
        />
      </span>
    </SettingsRow>
  );
}

/** Request timeout: the agent manages its own model-call timeouts and doesn't expose one. */
export function RequestTimeoutRow() {
  return (
    <SettingsRow
      description="Seconds before a model call gives up."
      htmlFor="settings-request-timeout"
      info={`${vocab.agent} manages its own model-call timeouts and doesn't offer this setting yet.`}
      note="Not offered by this agent"
      title="Request timeout"
    >
      <NotOffered />
      <Input
        className="w-24 shrink-0"
        disabled
        id="settings-request-timeout"
        placeholder="— s"
        type="number"
      />
    </SettingsRow>
  );
}

/** Context size when the model states no context controls: shown, at Max, not settable. */
export function ContextSizeUnavailableRow() {
  return (
    <SettingsRow
      htmlFor="working-context-tokens-unavailable"
      info="How much of the conversation this model is given each turn. This model's provider sets it, so it can't be changed here."
      note="Set by this model's provider"
      title="Context size"
    >
      <NotOffered />
      <SettingsChoice
        disabled
        id="working-context-choice-unavailable"
        label="Context size choice"
        onChange={() => undefined}
        options={[
          { value: 'max', label: 'Max', description: 'The model’s maximum' },
          { value: 'number', label: 'Number', description: 'A typed number of tokens' },
        ]}
        value="max"
      />
      <Input
        className="w-24 shrink-0"
        disabled
        id="working-context-tokens-unavailable"
        placeholder="Tokens"
        type="number"
      />
    </SettingsRow>
  );
}
