/**
 * UI component: Provider Setup Preset Grid. Renders `ProviderSetupPresetGrid` from `ProviderSetupPresetGridProps`.
 */
import { For, Show, type Accessor } from 'solid-js';
import {
  isReady,
  needsKey,
  statusChip,
  whatIsThis,
  type LmPreset,
} from './ProviderSetupModel.js';

export interface ProviderSetupPresetGridProps {
  presets: readonly LmPreset[];
  selected: Accessor<LmPreset | null>;
  apiKey: Accessor<string>;
  busy: Accessor<boolean>;
  onPick: (preset: LmPreset) => void;
  onCancelKey: () => void;
  onInputApiKey: (value: string) => void;
  onSubmitKey: (event: Event) => void;
}

export function ProviderSetupPresetGrid(props: ProviderSetupPresetGridProps) {
  return (
    <ul class="psetup__grid" data-testid="provider-setup-grid">
      <For each={props.presets}>
        {(preset) => {
          const chip = statusChip(preset);
          const isSelected = () => props.selected()?.id === preset.id;
          return (
            <li>
              <button
                type="button"
                class={'psetup__card ' + (isSelected() ? 'is-selected' : '')}
                disabled={props.busy()}
                onClick={() => props.onPick(preset)}
                data-testid={`provider-setup-card-${preset.id}`}
                data-ready={isReady(preset) ? '1' : '0'}
                data-needs-key={needsKey(preset) ? '1' : '0'}
              >
                <span class="psetup__card-head">
                  <span class="psetup__card-name">{preset.label}</span>
                  <span
                    class={'psetup__chip psetup__chip--' + chip.tone}
                    data-testid={`provider-setup-chip-${preset.id}`}
                  >
                    {chip.label}
                  </span>
                </span>
                <span class="psetup__card-what">{whatIsThis(preset)}</span>
              </button>

              <Show when={isSelected() && needsKey(preset)}>
                <form
                  class="psetup__keyform"
                  onSubmit={props.onSubmitKey}
                  data-testid={`provider-setup-keyform-${preset.id}`}
                >
                  <label class="psetup__keylabel" for={`psetup-key-${preset.id}`}>
                    Paste your API key for {preset.label}
                  </label>
                  <input
                    id={`psetup-key-${preset.id}`}
                    class="psetup__keyinput"
                    type="password"
                    autocomplete="off"
                    spellcheck={false}
                    placeholder="API key"
                    value={props.apiKey()}
                    onInput={(event) => props.onInputApiKey(event.currentTarget.value)}
                    data-testid={`provider-setup-keyinput-${preset.id}`}
                  />
                  <div class="psetup__keyactions">
                    <button type="button" class="btn btn--secondary" onClick={props.onCancelKey}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn btn--primary"
                      disabled={props.busy() || props.apiKey().trim().length === 0}
                      data-testid={`provider-setup-keysubmit-${preset.id}`}
                    >
                      {props.busy() ? 'Saving…' : 'Use this model'}
                    </button>
                  </div>
                </form>
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
