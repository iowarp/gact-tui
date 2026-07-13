/**
 * Settings → Models (task B2 §2) — the NON-TECHNICAL happy path for picking
 * the agent's language model.
 *
 * A novice configures a model by clicking, not by typing a backend URL or
 * pasting a token. So this section presents two VALIDATED DROPDOWNS:
 *
 *   1. Provider — sourced from GET /v1/providers/lm `presets[]` (id / label /
 *      provider / is_authenticated / auth_method / requires_api_key /
 *      suggested_model / status). Each option shows its readiness so the user
 *      never picks something that can't run.
 *   2. Model — sourced from GET /v1/providers/{id}/models when the preset
 *      advertises a live catalog (`supports_live_catalog`); otherwise we offer
 *      the preset's `suggested_model` as the single validated choice.
 *
 * "Use this model" PUTs /v1/providers/lm. Auth-gated presets show an inline
 * "needs sign-in / needs API key" notice with a one-click authenticate button
 * (oauth) or a link to where the key is configured — never a raw token field
 * in the happy path.
 *
 * The richer per-provider card grid (endpoints, vendor metadata, every model)
 * still lives in ProvidersPage; this is the focused chooser.
 */
import { createResource, Show } from 'solid-js';
import type { Client, LmPreset } from '@clio/core';
import { DiscoveryPage } from '../components/DiscoveryPage.js';
import {
  ListRow,
  Pill,
  SectionHeading,
} from '../components/SettingsPrimitives.js';
import { Icon } from '../components/Icon.js';
import { SettingsModelChooser } from './SettingsModelChooser.js';

export interface SettingsModelsProps {
  client: Client;
}

export function SettingsModels(props: SettingsModelsProps) {
  // The presets array on the LM config is our validated provider source.
  const [lm, { refetch: refetchLm }] = createResource(() =>
    props.client.lmConfig(),
  );

  const presets = (): LmPreset[] => lm()?.presets ?? [];

  const activeProvider = () => lm()?.provider;
  const activeModel = () => lm()?.model;
  const activeThinkingLevel = () => lm()?.thinking_level;
  const activeThinkingEffective = () => lm()?.thinking_effective;

  return (
    <DiscoveryPage
      icon="sparkle"
      title="Models"
      subtitle="Pick the language model the agent runs on. Choices are validated against your connected backend."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => void refetchLm()}
          title="Refresh"
          data-testid="models-refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={lm.loading}
      error={lm.error ? String((lm.error as Error).message ?? lm.error) : null}
      onRetry={() => void refetchLm()}
    >
      <div data-testid="settings-models">
        {/* Currently-active LM */}
        <SectionHeading
          title="Active model"
          hint="What the agent uses right now."
        />
        <Show
          when={lm()?.configured}
          fallback={
            <ListRow
              label="No model configured yet"
              description="Pick a provider and model below to get started."
              badge={<Pill tone="warn">not set</Pill>}
            />
          }
        >
          <ListRow
            testid="models-active-row"
            label={`${activeProvider()} · ${activeModel()}`}
            description={lm()?.api_base}
            badge={<Pill tone="accent">active</Pill>}
          />
        </Show>

        <SettingsModelChooser
          client={props.client}
          presets={presets}
          activeProvider={activeProvider}
          activeModel={activeModel}
          activeThinkingLevel={activeThinkingLevel}
          activeThinkingEffective={activeThinkingEffective}
          onChanged={refetchLm}
        />
      </div>
    </DiscoveryPage>
  );
}
