/**
 * Model-chooser settings component: provider/model selection UI over the
 * chooser state. Exports {@link SettingsModelChooser}.
 */
import { Show } from 'solid-js';
import { brand } from '@brand';
import {
  EmptyState,
  SectionHeading,
} from '../components/SettingsPrimitives.js';
import {
  ApplyModelButton,
  ModelRow,
  ProviderRow,
  StatusRow,
} from './SettingsModelChooserRows.js';
import { createSettingsModelChooserState } from './SettingsModelChooserState.js';
import type { SettingsModelChooserProps } from './SettingsModelChooserTypes.js';

export function SettingsModelChooser(props: SettingsModelChooserProps) {
  const state = createSettingsModelChooserState(props);

  return (
    <>
      <SectionHeading
        title="Choose a model"
        hint="Providers come from your backend. Authenticated ones are ready to use immediately."
      />

      <Show
        when={props.presets().length > 0}
        fallback={
          <EmptyState
            icon="sparkle"
            title="No providers available"
            body={`The connected backend reported no LM presets. Check that ${brand.name} is running and configured.`}
            testid="models-empty"
          />
        }
      >
        <ProviderRow
          presets={props.presets()}
          selectedId={state.selectedId()}
          onSelectedId={state.setSelectedId}
        />

        <ModelRow
          selected={state.selected()}
          selectedModel={state.selectedModel()}
          models={state.models() ?? []}
          loading={state.models.loading}
          onSelectedModel={state.setSelectedModel}
        />

        <StatusRow
          selected={state.selected()}
          busy={state.busy()}
          onAuthenticate={() => void state.authenticate()}
        />

        <Show when={state.blockedReason()}>
          <p class="settings-shell__hint" data-testid="models-blocked-hint">
            {state.blockedReason()}
          </p>
        </Show>
        <Show when={state.authMsg()}>
          <p class="settings-shell__hint" data-testid="models-auth-msg">
            {state.authMsg()}
          </p>
        </Show>
        <Show when={state.error()}>
          <div class="settings__error" data-testid="models-error">
            {state.error()}
          </div>
        </Show>

        <ApplyModelButton
          busy={state.busy()}
          isActiveSelection={state.isActiveSelection()}
          selectedModel={state.selectedModel()}
          blocked={state.blockedReason() !== null}
          onApply={() => void state.applySelection()}
        />
      </Show>
    </>
  );
}
