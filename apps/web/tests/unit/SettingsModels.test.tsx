/**
 * Task B2 §2 — validated provider/model config.
 *
 *  - The provider dropdown is sourced from GET /v1/providers/lm `presets[]`
 *    (validated choices), NOT a free-text URL.
 *  - It shows readiness (authenticated presets are ready; unauthenticated ones
 *    are flagged "needs setup").
 *  - The model dropdown is populated from the preset's suggested model and/or
 *    GET /v1/providers/{id}/models for live-catalog presets.
 *  - "Use this model" PUTs /v1/providers/lm via client.setLm with the chosen
 *    provider + model — no raw token in the happy path.
 *  - An oauth-gated, unauthenticated preset blocks Use and offers Sign in.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, LmConfigSnapshot, LmPreset } from '@clio/core';
import { SettingsModels } from '../../src/routes/SettingsModels.js';

afterEach(cleanup);

const PRESETS: LmPreset[] = [
  {
    id: 'argonne_sophia',
    label: 'ALCF Sophia (Globus Auth)',
    provider: 'argonne',
    api_base: 'https://sophia/v1',
    suggested_model: 'openai/gpt-oss-120b',
    requires_api_key: false,
    auth_method: 'oauth',
    is_authenticated: true,
    status: 'ready',
    status_message: 'Globus token validated',
    supports_live_catalog: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic API',
    provider: 'anthropic',
    api_base: 'https://api.anthropic.com/v1',
    suggested_model: 'claude-sonnet-4-20250514',
    requires_api_key: true,
    api_key_env: 'CLIO_LM_API_KEY',
    auth_method: 'api_key',
    is_authenticated: false,
    status: 'needs_auth',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai',
    api_base: 'https://openrouter.ai/api/v1',
    suggested_model: 'openai/gpt-oss-120b:free',
    requires_api_key: false,
    auth_method: 'oauth',
    is_authenticated: false,
    status: 'needs_auth',
    supports_live_catalog: false,
  },
];

function makeLm(overrides: Partial<LmConfigSnapshot> = {}): LmConfigSnapshot {
  return {
    configured: true,
    provider: 'argonne',
    api_base: 'https://sophia/v1',
    model: 'openai/gpt-oss-120b',
    presets: PRESETS,
    ...overrides,
  };
}

function makeClient(over: Partial<Record<keyof Client, unknown>> = {}): {
  client: Client;
  setLm: ReturnType<typeof vi.fn>;
  providerModels: ReturnType<typeof vi.fn>;
  authProvider: ReturnType<typeof vi.fn>;
} {
  const lmConfig = vi.fn().mockResolvedValue(makeLm());
  const setLm = vi.fn().mockResolvedValue(makeLm());
  const providerModels = vi.fn().mockResolvedValue({
    models: [
      { id: 'openai/gpt-oss-120b', label: 'gpt-oss-120b' },
      { id: 'argonne/AuroraGPT-IT-v4-0125', label: 'AuroraGPT-IT-v4' },
    ],
  });
  const authProvider = vi
    .fn()
    .mockResolvedValue({ is_authenticated: false, provider_id: 'openrouter', instructions: 'run login' });
  const client = {
    lmConfig,
    setLm,
    providerModels,
    authProvider,
    ...over,
  } as unknown as Client;
  return { client, setLm, providerModels, authProvider };
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId('settings-models')).toBeTruthy());
  await waitFor(() =>
    expect(screen.getByTestId('models-provider-list')).toBeTruthy(),
  );
}

describe('SettingsModels — validated dropdowns', () => {
  it('renders the provider menu from lm presets (not a URL field)', async () => {
    const { client } = makeClient();
    render(() => <SettingsModels client={client} />);
    await ready();

    const list = screen.getByTestId('models-provider-list');
    expect(list.textContent).toContain('ALCF Sophia (Globus Auth)');
    expect(list.textContent).toContain('Anthropic API');
    expect(list.textContent).toContain('OpenRouter');
    // Unauthenticated presets are flagged for the novice.
    expect(screen.getByTestId('models-provider-anthropic').textContent).toContain(
      'awaiting configuration',
    );
    // No raw backend-URL text input in the happy path.
    expect(screen.queryByLabelText(/api base/i)).toBeNull();
  });

  it('shows the active LM and the ready status pill for an authed preset', async () => {
    const { client } = makeClient();
    render(() => <SettingsModels client={client} />);
    await ready();
    expect(screen.getByTestId('models-active-row').textContent).toContain(
      'openai/gpt-oss-120b',
    );
    await waitFor(() =>
      expect(screen.getByTestId('models-status-pill').textContent).toContain(
        'Globus token validated',
      ),
    );
  });

  it('populates the model dropdown from the live catalog and PUTs the choice', async () => {
    const { client, setLm, providerModels } = makeClient();
    render(() => <SettingsModels client={client} />);
    await ready();

    // Sophia advertises a live catalog → providerModels is queried.
    await waitFor(() => expect(providerModels).toHaveBeenCalledWith('argonne_sophia'));
    const modelSelect = await waitFor(() => {
      const el = screen.getByTestId('models-model-select') as HTMLSelectElement;
      if (el.options.length < 2) throw new Error('models not loaded yet');
      return el;
    });
    // Pick a different model, then apply.
    fireEvent.change(modelSelect, {
      target: { value: 'argonne/AuroraGPT-IT-v4-0125' },
    });
    fireEvent.click(screen.getByTestId('models-apply-btn'));

    await waitFor(() =>
      expect(setLm).toHaveBeenCalledWith({
        provider: 'argonne_sophia',
        api_base: 'https://sophia/v1',
        model: 'argonne/AuroraGPT-IT-v4-0125',
      }),
    );
  });

  it('blocks Use and offers Sign in for an unauthenticated oauth preset', async () => {
    const { client, authProvider } = makeClient();
    render(() => <SettingsModels client={client} />);
    await ready();

    fireEvent.click(screen.getByTestId('models-provider-openrouter').querySelector('button')!);

    await waitFor(() =>
      expect(screen.getByTestId('models-blocked-hint')).toBeTruthy(),
    );
    expect(
      (screen.getByTestId('models-apply-btn') as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByTestId('models-auth-btn'));
    await waitFor(() => expect(authProvider).toHaveBeenCalledWith('openrouter'));
  });
});
