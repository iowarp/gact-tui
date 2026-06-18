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
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { brand } from '@brand';
import type { Client, LmPreset } from '@clio/core';
import { DiscoveryPage } from '../components/DiscoveryPage.js';
import {
  EmptyState,
  ListRow,
  LoadingState,
  Pill,
  SectionHeading,
  type PillTone,
} from '../components/SettingsPrimitives.js';
import { Icon } from '../components/Icon.js';

export interface SettingsModelsProps {
  client: Client;
}

function presetTone(p: LmPreset): PillTone {
  if (p.is_authenticated) return 'ok';
  if ((p.auth_method ?? 'none') !== 'none') return 'warn';
  return 'neutral';
}

function presetStatusLabel(p: LmPreset): string {
  if (p.status_message) return p.status_message;
  if (p.status) return p.status;
  if (p.is_authenticated) return 'ready';
  if (p.requires_api_key) return 'needs API key';
  if ((p.auth_method ?? 'none') === 'oauth') return 'needs sign-in';
  return 'ready';
}

export function SettingsModels(props: SettingsModelsProps) {
  // The presets array on the LM config is our validated provider source.
  const [lm, { refetch: refetchLm }] = createResource(() =>
    props.client.lmConfig(),
  );

  const presets = (): LmPreset[] => lm()?.presets ?? [];

  const [selectedId, setSelectedId] = createSignal<string>('');
  const [selectedModel, setSelectedModel] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [authMsg, setAuthMsg] = createSignal<string | null>(null);

  // Default the provider dropdown to the currently-active provider (or the
  // first authenticated preset, or just the first) once data lands.
  createEffect(() => {
    const list = presets();
    if (list.length === 0 || selectedId()) return;
    const active = lm()?.provider;
    const byActive = list.find((p) => p.provider === active || p.id === active);
    const firstAuthed = list.find((p) => p.is_authenticated);
    const pick = byActive ?? firstAuthed ?? list[0];
    if (pick) setSelectedId(pick.id);
  });

  const selected = (): LmPreset | undefined =>
    presets().find((p) => p.id === selectedId());

  // Model dropdown source: live catalog when the preset supports it, else the
  // single suggested model. Keyed on the selected preset id so switching
  // providers refetches.
  const [models] = createResource(
    () => {
      const p = selected();
      if (!p) return null;
      return { id: p.id, live: p.supports_live_catalog === true };
    },
    async (arg) => {
      if (!arg) return [] as Array<{ id: string; label?: string }>;
      const p = presets().find((x) => x.id === arg.id);
      const suggested = p?.suggested_model
        ? [{ id: p.suggested_model, label: `${p.suggested_model} (suggested)` }]
        : [];
      if (!arg.live) return suggested;
      try {
        const res = await props.client.providerModels(arg.id);
        const live = (res.models ?? []).map((m) => ({
          id: m.id,
          label: m.label ?? m.id,
        }));
        if (live.length === 0) return suggested;
        // Make sure the suggested model is selectable even if the catalog
        // omits it (e.g. a vendor default not yet loaded).
        if (p?.suggested_model && !live.some((m) => m.id === p.suggested_model)) {
          return [...suggested, ...live];
        }
        return live;
      } catch {
        // Fall back to the suggested model rather than dead-ending.
        return suggested;
      }
    },
  );

  // When the model list resolves, default the model dropdown to the preset's
  // suggested model (or the first option).
  createEffect(() => {
    const list = models();
    const p = selected();
    if (!list || list.length === 0) {
      setSelectedModel('');
      return;
    }
    const pref =
      list.find((m) => m.id === p?.suggested_model)?.id ?? list[0]?.id ?? '';
    setSelectedModel(pref);
  });

  const activeProvider = () => lm()?.provider;
  const activeModel = () => lm()?.model;
  const isActiveSelection = () =>
    !!selected() &&
    (selected()!.provider === activeProvider() ||
      selected()!.id === activeProvider()) &&
    selectedModel() === activeModel();

  const blockedReason = (): string | null => {
    const p = selected();
    if (!p) return 'Pick a provider to continue.';
    if (p.is_authenticated) return null;
    if (p.requires_api_key)
      return `This provider needs an API key. Set ${p.api_key_env ?? 'the provider key'} on the backend, then refresh.`;
    if ((p.auth_method ?? 'none') === 'oauth')
      return 'This provider needs you to sign in before it can run.';
    return null;
  };

  async function applySelection() {
    const p = selected();
    if (!p) return;
    setError(null);
    setBusy(true);
    try {
      await props.client.setLm({
        provider: p.id,
        api_base: p.api_base ?? '',
        model: selectedModel() || p.suggested_model || 'unknown',
      });
      await refetchLm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate() {
    const p = selected();
    if (!p) return;
    setError(null);
    setAuthMsg(null);
    setBusy(true);
    try {
      const resp = await props.client.authProvider(p.id);
      if (!resp.is_authenticated && resp.instructions) {
        setAuthMsg(resp.instructions);
      } else if (resp.is_authenticated) {
        setAuthMsg('Signed in.');
      }
      await refetchLm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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

        {/* Validated chooser */}
        <SectionHeading
          title="Choose a model"
          hint="Providers come from your backend. Authenticated ones are ready to use immediately."
        />

        <Show
          when={presets().length > 0}
          fallback={
            <EmptyState
              icon="sparkle"
              title="No providers available"
              body={`The connected backend reported no LM presets. Check that ${brand.name} is running and configured.`}
              testid="models-empty"
            />
          }
        >
          <ListRow
            testid="models-provider-row"
            label="Provider"
            description="The service that hosts the model."
            control={
              <select
                class="sx-select"
                data-testid="models-provider-select"
                value={selectedId()}
                onChange={(e) => setSelectedId(e.currentTarget.value)}
              >
                <For each={presets()}>
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

          <ListRow
            testid="models-model-row"
            label="Model"
            description={
              selected()?.supports_live_catalog
                ? 'Live list discovered from the provider.'
                : 'Recommended model for this provider.'
            }
            control={
              <Show
                when={!models.loading}
                fallback={<LoadingState label="Loading models…" testid="models-model-loading" />}
              >
                <select
                  class="sx-select"
                  data-testid="models-model-select"
                  value={selectedModel()}
                  disabled={(models()?.length ?? 0) === 0}
                  onChange={(e) => setSelectedModel(e.currentTarget.value)}
                >
                  <For each={models() ?? []}>
                    {(m) => <option value={m.id}>{m.label ?? m.id}</option>}
                  </For>
                  <Show when={(models()?.length ?? 0) === 0}>
                    <option value="">No models available</option>
                  </Show>
                </select>
              </Show>
            }
          />

          {/* Status / readiness for the selected preset */}
          <Show when={selected()}>
            <ListRow
              testid="models-status-row"
              label="Status"
              description={selected()!.description}
              badge={
                <Pill
                  tone={presetTone(selected()!)}
                  testid="models-status-pill"
                >
                  {presetStatusLabel(selected()!)}
                </Pill>
              }
              control={
                <Show when={(selected()!.auth_method ?? 'none') === 'oauth' && !selected()!.is_authenticated}>
                  <button
                    type="button"
                    class="dp__card-btn"
                    data-testid="models-auth-btn"
                    disabled={busy()}
                    onClick={() => void authenticate()}
                  >
                    Sign in
                  </button>
                </Show>
              }
            />
          </Show>

          {/* Inline validation for auth-gated / key-gated presets */}
          <Show when={blockedReason()}>
            <p class="settings-shell__hint" data-testid="models-blocked-hint">
              {blockedReason()}
            </p>
          </Show>
          <Show when={authMsg()}>
            <p class="settings-shell__hint" data-testid="models-auth-msg">
              {authMsg()}
            </p>
          </Show>
          <Show when={error()}>
            <div class="settings__error" data-testid="models-error">
              {error()}
            </div>
          </Show>

          <div class="settings__actions">
            <button
              type="button"
              class="ws-form__btn ws-form__btn--primary"
              data-testid="models-apply-btn"
              disabled={
                busy() ||
                isActiveSelection() ||
                !selectedModel() ||
                blockedReason() !== null
              }
              onClick={() => void applySelection()}
            >
              {busy()
                ? 'Applying…'
                : isActiveSelection()
                  ? 'In use'
                  : 'Use this model'}
            </button>
          </div>
        </Show>
      </div>
    </DiscoveryPage>
  );
}
