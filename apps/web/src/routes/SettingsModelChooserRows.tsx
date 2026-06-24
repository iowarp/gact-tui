/**
 * Row components for the model chooser (provider, model, status rows).
 */
import { For, Show } from 'solid-js';
import type { LmPreset } from '@clio/core';
import {
  ListRow,
  LoadingState,
  Pill,
} from '../components/SettingsPrimitives.js';
import {
  presetStatusLabel,
  presetTone,
  type ModelOption,
} from './SettingsModelChooserModel.js';

export interface ProviderRowProps {
  presets: LmPreset[];
  selectedId: string;
  onSelectedId: (value: string) => void;
}

export function ProviderRow(props: ProviderRowProps) {
  return (
    <ListRow
      testid="models-provider-row"
      label="Provider"
      description="The service that hosts the model."
      control={
        <select
          class="sx-select"
          data-testid="models-provider-select"
          value={props.selectedId}
          onChange={(e) => props.onSelectedId(e.currentTarget.value)}
        >
          <For each={props.presets}>
            {(p) => (
              <option value={p.id}>
                {p.label}
                {p.is_authenticated ? '' : ' — needs setup'}
              </option>
            )}
          </For>
        </select>
      }
    />
  );
}

export interface ModelRowProps {
  selected?: LmPreset;
  selectedModel: string;
  models: ModelOption[];
  loading: boolean;
  onSelectedModel: (value: string) => void;
}

export function ModelRow(props: ModelRowProps) {
  return (
    <ListRow
      testid="models-model-row"
      label="Model"
      description={
        props.selected?.supports_live_catalog
          ? 'Live list discovered from the provider.'
          : 'Recommended model for this provider.'
      }
      control={
        <Show
          when={!props.loading}
          fallback={<LoadingState label="Loading models…" testid="models-model-loading" />}
        >
          <select
            class="sx-select"
            data-testid="models-model-select"
            value={props.selectedModel}
            disabled={props.models.length === 0}
            onChange={(e) => props.onSelectedModel(e.currentTarget.value)}
          >
            <For each={props.models}>
              {(m) => <option value={m.id}>{m.label ?? m.id}</option>}
            </For>
            <Show when={props.models.length === 0}>
              <option value="">No models available</option>
            </Show>
          </select>
        </Show>
      }
    />
  );
}

export interface StatusRowProps {
  selected?: LmPreset;
  busy: boolean;
  onAuthenticate: () => void;
}

export function StatusRow(props: StatusRowProps) {
  return (
    <Show when={props.selected}>
      {(selected) => (
        <ListRow
          testid="models-status-row"
          label="Status"
          description={selected().description}
          badge={
            <Pill tone={presetTone(selected())} testid="models-status-pill">
              {presetStatusLabel(selected())}
            </Pill>
          }
          control={
            <Show
              when={
                (selected().auth_method ?? 'none') === 'oauth' && !selected().is_authenticated
              }
            >
              <button
                type="button"
                class="dp__card-btn"
                data-testid="models-auth-btn"
                disabled={props.busy}
                onClick={props.onAuthenticate}
              >
                Sign in
              </button>
            </Show>
          }
        />
      )}
    </Show>
  );
}

export interface ApplyModelButtonProps {
  busy: boolean;
  isActiveSelection: boolean;
  selectedModel: string;
  blocked: boolean;
  onApply: () => void;
}

export function ApplyModelButton(props: ApplyModelButtonProps) {
  return (
    <div class="settings__actions">
      <button
        type="button"
        class="ws-form__btn ws-form__btn--primary"
        data-testid="models-apply-btn"
        disabled={
          props.busy ||
          props.isActiveSelection ||
          !props.selectedModel ||
          props.blocked
        }
        onClick={props.onApply}
      >
        {props.busy ? 'Applying…' : props.isActiveSelection ? 'In use' : 'Use this model'}
      </button>
    </div>
  );
}
