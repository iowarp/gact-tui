/**
 * UI component: Provider Setup. Renders `ProviderSetup` from `ProviderSetupProps`.
 */
import { createResource, createSignal, Show } from 'solid-js';
import { brand } from '@brand';
import type { Client } from '@clio/core';
import { runAsyncAction } from '../asyncAction.js';
import {
  needsKey,
  orderPresets,
  providerSelectionBody,
  type LmPreset,
} from './ProviderSetupModel.js';
import { ProviderSetupPresetGrid } from './ProviderSetupPresetGrid.js';
import './provider-setup.css';

export {
  isReady,
  needsKey,
  orderPresets,
  providerSelectionBody,
  statusChip,
  whatIsThis,
  type LmPreset,
} from './ProviderSetupModel.js';

/**
 * Provider/model setup for first-run onboarding (task B5).
 *
 * Surfaces clio's LM provider presets as selectable cards so a *non-technical*
 * user can reach a working first turn in clicks — no raw YAML, no backend URL,
 * no bearer token in the happy path. Curated/ready providers (those clio reports
 * as `status: "ready"`) float to the top; everything else follows.
 *
 * Data source: `GET /v1/providers/lm` → `presets[]`. That payload is richer than
 * the bulk `/v1/providers` list — each preset carries `status`, `is_authenticated`,
 * `requires_api_key`, `auth_method`, `suggested_model`, `label`, and `description`.
 * The typed `LmConfigSnapshot.presets` in @clio/core is a subset of those fields,
 * so we widen locally (read-only — we never modify the core client).
 *
 * Picking a ready provider → `PUT /v1/providers/lm` and advance. Picking one that
 * needs a key → reveal a single key field (label only), then configure with the
 * key included in the PUT body (the clio backend accepts `api_key` on the LM PUT).
 */

export interface ProviderSetupProps {
  client: Client;
  /** Called once a provider has been configured successfully. */
  onConfigured: (preset: LmPreset) => void;
  /** Called when the user opts out of provider setup for now. */
  onSkip: () => void;
}

export function ProviderSetup(props: ProviderSetupProps) {
  // Pull presets straight off the LM config snapshot — richer than /v1/providers.
  const [snapshot, { refetch }] = createResource(async () => {
    const cfg = (await props.client.lmConfig()) as unknown as {
      presets?: LmPreset[];
    };
    return cfg.presets ?? [];
  });

  const ordered = () => orderPresets(snapshot() ?? []);

  const [selected, setSelected] = createSignal<LmPreset | null>(null);
  const [apiKey, setApiKey] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function pick(p: LmPreset) {
    setError(null);
    if (needsKey(p)) {
      // Reveal the single key field; configuration waits for the key.
      setSelected(p);
      setApiKey('');
      return;
    }
    void configure(p);
  }

  async function configure(p: LmPreset, key?: string) {
    await runAsyncAction(
      async () => {
        // The clio LM PUT accepts an optional `api_key` for key-based providers.
        // It's not in the strict core type, so we widen the call site only.
        const body = providerSelectionBody(p, key);
        await (props.client.setLm as (b: typeof body) => Promise<unknown>)(body);
        props.onConfigured(p);
      },
      { setBusy, setError },
    );
  }

  function submitKey(e: Event) {
    e.preventDefault();
    const p = selected();
    if (!p) return;
    void configure(p, apiKey().trim());
  }

  return (
    <div class="psetup" data-testid="provider-setup">
      <h2 class="psetup__title" data-testid="provider-setup-title">
        Pick a model to get started
      </h2>
      <p class="psetup__lede">
        Choose where {brand.name} should send your messages. Cards marked{' '}
        <span class="psetup__chip psetup__chip--ready">Ready</span> work right away — no key to
        paste.
      </p>

      <Show when={error()}>
        <div class="psetup__error" data-testid="provider-setup-error" role="alert">
          {error()}
        </div>
      </Show>

      <Show
        when={!snapshot.loading}
        fallback={
          <div class="psetup__loading" data-testid="provider-setup-loading">
            Loading providers…
          </div>
        }
      >
        <Show
          when={(snapshot()?.length ?? 0) > 0}
          fallback={
            <div class="psetup__empty" data-testid="provider-setup-empty">
              <p>No providers are available from the backend yet.</p>
              <button type="button" class="btn btn--secondary" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          }
        >
          <ProviderSetupPresetGrid
            presets={ordered()}
            selected={selected}
            apiKey={apiKey}
            busy={busy}
            onPick={pick}
            onCancelKey={() => setSelected(null)}
            onInputApiKey={setApiKey}
            onSubmitKey={submitKey}
          />
        </Show>
      </Show>

      <div class="psetup__footer">
        <button
          type="button"
          class="psetup__skip"
          onClick={props.onSkip}
          data-testid="provider-setup-skip"
        >
          Skip for now — I'll set this up in Settings → Providers
        </button>
      </div>
    </div>
  );
}
