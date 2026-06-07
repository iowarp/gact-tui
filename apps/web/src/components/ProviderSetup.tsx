import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import './provider-setup.css';

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

/** A preset as it actually arrives on the wire from `/v1/providers/lm`. */
export interface LmPreset {
  id: string;
  label: string;
  provider: string;
  api_base?: string;
  suggested_model?: string;
  requires_api_key?: boolean;
  api_key_env?: string;
  auth_method?: string;
  is_authenticated?: boolean;
  description?: string;
  status?: string;
  status_message?: string;
}

/** A preset is "ready" — usable in one click, no key needed — when clio reports
 * its runtime status as ready. These are the curated cards we float to the top. */
export function isReady(p: LmPreset): boolean {
  return (p.status ?? '').toLowerCase() === 'ready';
}

/** A preset needs a key from the user before it can be used. */
export function needsKey(p: LmPreset): boolean {
  return p.requires_api_key === true && !isReady(p);
}

/**
 * Curated-first ordering: ready providers first (stable by their incoming
 * order), then the rest. Within "the rest", providers that only need a single
 * API key come before ones that need external auth/setup, so the easiest next
 * options surface first. Stable: equal-rank items keep input order.
 */
export function orderPresets(presets: readonly LmPreset[]): LmPreset[] {
  const rank = (p: LmPreset): number => {
    if (isReady(p)) return 0;
    if (needsKey(p)) return 1;
    return 2;
  };
  return presets
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/** Short, novice-friendly "what is this" copy keyed by provider kind/id. Falls
 * back to the preset's own description (trimmed) when we have nothing curated. */
export function whatIsThis(p: LmPreset): string {
  const byId: Record<string, string> = {
    claude_code:
      'Uses your existing Claude Code subscription on this machine. No API key needed.',
    codex:
      'Uses your existing ChatGPT / Codex subscription on this machine. No API key needed.',
    argonne_sophia:
      'Argonne ALCF Sophia models, signed in with your lab identity. No key to paste.',
    argonne_metis:
      'Argonne ALCF Metis models, signed in with your lab identity. No key to paste.',
    argonne_local_vllm: 'A local vLLM server you run yourself. No key needed.',
    lm_studio: 'Models running locally in LM Studio on this computer. No key needed.',
    ollama: 'Models running locally via Ollama on this computer. No key needed.',
    anthropic: 'Anthropic models, billed to your own Anthropic API key.',
    openai: 'OpenAI models (GPT-4o, etc.), billed to your own OpenAI API key.',
    openrouter: 'Many models through one gateway, billed to your OpenRouter key.',
  };
  return byId[p.id] ?? (p.description ?? '').trim();
}

/** Friendly chip label + tone for a preset's readiness. */
export function statusChip(p: LmPreset): { label: string; tone: 'ready' | 'key' | 'setup' } {
  if (isReady(p)) return { label: 'Ready', tone: 'ready' };
  if (needsKey(p)) return { label: 'Needs key', tone: 'key' };
  return { label: 'Needs setup', tone: 'setup' };
}

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
    setBusy(true);
    setError(null);
    try {
      const model =
        p.suggested_model && p.suggested_model.length > 0 ? p.suggested_model : '';
      // The clio LM PUT accepts an optional `api_key` for key-based providers.
      // It's not in the strict core type, so we widen the call site only.
      const body: {
        provider: string;
        api_base: string;
        model: string;
        api_key?: string;
      } = {
        provider: p.id,
        api_base: p.api_base ?? '',
        model,
      };
      if (key && key.length > 0) body.api_key = key;
      await (
        props.client.setLm as (b: typeof body) => Promise<unknown>
      )(body);
      props.onConfigured(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
        Choose where CLIO should send your messages. Cards marked{' '}
        <span class="psetup__chip psetup__chip--ready">Ready</span> work right away —
        no key to paste.
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
          <ul class="psetup__grid" data-testid="provider-setup-grid">
            <For each={ordered()}>
              {(p) => {
                const chip = statusChip(p);
                const isSel = () => selected()?.id === p.id;
                return (
                  <li>
                    <button
                      type="button"
                      class={'psetup__card ' + (isSel() ? 'is-selected' : '')}
                      disabled={busy()}
                      onClick={() => pick(p)}
                      data-testid={`provider-setup-card-${p.id}`}
                      data-ready={isReady(p) ? '1' : '0'}
                      data-needs-key={needsKey(p) ? '1' : '0'}
                    >
                      <span class="psetup__card-head">
                        <span class="psetup__card-name">{p.label}</span>
                        <span
                          class={'psetup__chip psetup__chip--' + chip.tone}
                          data-testid={`provider-setup-chip-${p.id}`}
                        >
                          {chip.label}
                        </span>
                      </span>
                      <span class="psetup__card-what">{whatIsThis(p)}</span>
                    </button>

                    <Show when={isSel() && needsKey(p)}>
                      <form
                        class="psetup__keyform"
                        onSubmit={submitKey}
                        data-testid={`provider-setup-keyform-${p.id}`}
                      >
                        <label class="psetup__keylabel" for={`psetup-key-${p.id}`}>
                          Paste your API key for {p.label}
                        </label>
                        <input
                          id={`psetup-key-${p.id}`}
                          class="psetup__keyinput"
                          type="password"
                          autocomplete="off"
                          spellcheck={false}
                          placeholder="API key"
                          value={apiKey()}
                          onInput={(ev) => setApiKey(ev.currentTarget.value)}
                          data-testid={`provider-setup-keyinput-${p.id}`}
                        />
                        <div class="psetup__keyactions">
                          <button
                            type="button"
                            class="btn btn--secondary"
                            onClick={() => setSelected(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            class="btn btn--primary"
                            disabled={busy() || apiKey().trim().length === 0}
                            data-testid={`provider-setup-keysubmit-${p.id}`}
                          >
                            {busy() ? 'Saving…' : 'Use this model'}
                          </button>
                        </div>
                      </form>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
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
