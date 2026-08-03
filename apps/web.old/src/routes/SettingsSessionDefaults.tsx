/**
 * Session-defaults settings section: default blueprint/expert-pack pickers.
 * Exports {@link SessionDefaultsSection}.
 */
import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import { Client } from '@clio/core';
import { Icon } from '../components/Icon.js';
import { blueprintControlLabel, showExpertPackPicker } from '../brand-presentation.js';
import { SectionHeading } from '../components/SettingsPrimitives.js';
import { useToast } from '../components/Toast.js';
import {
  loadSessionSemanticsDefaults,
  saveSessionSemanticsDefaults,
  sanitizeSessionSemantics,
} from '../session-semantics.js';
import type { SettingsContext } from './SettingsShell.js';
import {
  sessionDefaultsCatalogFromSettled,
  sessionDefaultsCatalogScope,
} from './SettingsSessionDefaultsModel.js';

export function SessionDefaultsSection(props: { client: Client; context?: SettingsContext }) {
  const toast = useToast();
  const [catalog, { refetch }] = createResource(async () => {
    const scope = sessionDefaultsCatalogScope(props.context);
    const [blueprints, expertPacks] = await Promise.allSettled([
      props.client.agentBlueprints(scope),
      props.client.expertPacks(scope),
    ]);
    return sessionDefaultsCatalogFromSettled(blueprints, expertPacks);
  });
  const [blueprintId, setBlueprintId] = createSignal('');
  const [expertPackId, setExpertPackId] = createSignal('');

  createEffect(() => {
    const data = catalog();
    if (!data) return;
    const defaults = sanitizeSessionSemantics(
      loadSessionSemanticsDefaults(),
      data.blueprints,
      data.expertPacks,
    );
    setBlueprintId(defaults.blueprintId);
    setExpertPackId(showExpertPackPicker() ? defaults.expertPackId : '');
  });

  function save() {
    saveSessionSemanticsDefaults({
      blueprintId: blueprintId(),
      expertPackId: showExpertPackPicker() ? expertPackId() : '',
    });
    toast.push({
      tone: 'success',
      title: 'Session defaults saved',
      duration: 2200,
    });
  }

  function clear() {
    setBlueprintId('');
    setExpertPackId('');
    saveSessionSemanticsDefaults({ blueprintId: '', expertPackId: '' });
    toast.push({
      tone: 'info',
      title: 'Session defaults cleared',
      duration: 2200,
    });
  }

  const data = () => catalog() ?? { blueprints: [], expertPacks: [] };

  return (
    <section class="dp" data-testid="settings-session-defaults">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="branch" size={20} />
          </div>
          <div>
            <h1 class="dp__title">Session defaults</h1>
            <p class="dp__subtitle">Choose the default semantics applied to new sessions.</p>
          </div>
        </div>
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => void refetch()}
          title="Refresh"
          data-testid="session-defaults-refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      </header>

      <div class="dp__body">
        <SectionHeading
          title="Defaults"
          hint="Used by New session and by the first message in an empty chat."
        />
        <div class="settings-shell__form-grid">
          <label class="settings-shell__field">
            <span>{blueprintControlLabel()}</span>
            <select
              value={blueprintId()}
              onChange={(e) => setBlueprintId(e.currentTarget.value)}
              disabled={catalog.loading}
              data-testid="session-default-blueprint"
            >
              <Show when={data().blueprints.length === 0}>
                <option value="">No installed blueprints</option>
              </Show>
              <For each={data().blueprints}>
                {(bp) => <option value={bp.id}>{bp.label}</option>}
              </For>
            </select>
          </label>
          <Show when={showExpertPackPicker()}>
            <label class="settings-shell__field">
              <span>Expert pack</span>
              <select
                value={expertPackId()}
                onChange={(e) => setExpertPackId(e.currentTarget.value)}
                disabled={catalog.loading}
                data-testid="session-default-expert-pack"
              >
                <option value="">No expert pack</option>
                <For each={data().expertPacks}>
                  {(pack) => <option value={pack.id}>{pack.label}</option>}
                </For>
              </select>
            </label>
          </Show>
        </div>
        <div class="settings__actions">
          <button
            type="button"
            class="btn btn--primary"
            onClick={save}
            data-testid="session-defaults-save"
          >
            Save defaults
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            onClick={clear}
            data-testid="session-defaults-clear"
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
