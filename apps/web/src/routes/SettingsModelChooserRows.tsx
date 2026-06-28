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
import './settings-model-chooser.css';

export interface ProviderRowProps {
  presets: LmPreset[];
  selectedId: string;
  busy: boolean;
  onSelectedId: (value: string) => void;
  onAuthenticate: (value: string) => void;
}

export function ProviderRow(props: ProviderRowProps) {
  return (
    <ListRow
      testid="models-provider-row"
      label="Providers"
      description="Pick a provider to see its setup state, then choose one of its models."
      control={
        <div class="models-provider-list" data-testid="models-provider-list">
          <For each={props.presets}>
            {(p) => (
              <div
                class="models-provider-list__row"
                classList={{
                  'is-active': props.selectedId === p.id,
                  'is-disabled': !p.is_authenticated,
                }}
                data-testid={`models-provider-${p.id}`}
              >
                <button
                  type="button"
                  class="models-provider-list__btn"
                  disabled={props.busy}
                  aria-pressed={props.selectedId === p.id}
                  onClick={() => props.onSelectedId(p.id)}
                >
                  <span class="models-provider-list__label">{p.label}</span>
                  <Pill tone={presetTone(p)}>
                    {p.is_authenticated ? 'ready' : 'awaiting configuration'}
                  </Pill>
                </button>
                <Show when={!p.is_authenticated && (p.auth_method ?? 'none') === 'oauth'}>
                  <button
                    type="button"
                    class="dp__card-btn"
                    data-testid={`models-provider-setup-${p.id}`}
                    disabled={props.busy}
                    onClick={() => props.onAuthenticate(p.id)}
                  >
                    Sign in
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
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
      label={props.selected ? `Models for ${props.selected.label}` : 'Models'}
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
