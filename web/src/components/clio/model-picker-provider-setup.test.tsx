import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  defaultConfiguration,
  footerButtonNames,
  mockOpenaiApiKeyPreset,
  openaiOption,
  options,
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  // Queued one-shot results must never leak into the next test.
  for (const mock of Object.values(repository)) mock.mockReset();
});

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
});

const signedOutCodex = {
  ...defaultConfiguration,
  presets: defaultConfiguration.presets.map((preset) =>
    preset.id === 'codex' ? { ...preset, is_authenticated: false } : preset,
  ),
};
const codexProviderRow = {
  ...options[0]!,
  id: '',
  kind: 'provider' as const,
  label: 'Codex',
  available: false,
  health: 'needs_setup',
};

function sentence(): HTMLElement | null {
  return document.querySelector('[data-slot="provider-connect-sentence"]');
}

async function open(pickerOptions: Parameters<typeof ClioModelPicker>[0]['options'], provider?: string) {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker
      model={provider ? 'gpt-5.6-luna' : undefined}
      onChange={vi.fn()}
      options={pickerOptions}
      provider={provider}
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

describe('ClioModelPicker: a usable provider', () => {
  it('lists its models with one action row: Refresh, Reload models, Log out', async () => {
    await open(options, 'codex');

    expect(screen.getByText('Luna')).toBeVisible();
    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models', 'Log out']);
    // One transport: never an "or".
    expect(document.querySelector('[data-slot="transport-separator"]')).toBeNull();
    // No floating settings icon.
    expect(document.querySelector('[data-slot="provider-settings-link"]')).toBeNull();
  });

  it('a pasted key offers Remove key, which never rebinds the active provider', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...defaultConfiguration,
      presets: [
        ...defaultConfiguration.presets,
        {
          id: 'openai',
          label: 'OpenAI',
          provider: 'openai',
          api_base: 'https://api.openai.com/v1',
          suggested_model: 'gpt-4o-mini',
          requires_api_key: true,
          auth_method: 'api_key',
          is_authenticated: true,
        },
      ],
    });
    repository.clearProviderApiKey.mockResolvedValueOnce({ provider_id: 'openai', is_authenticated: false });
    const user = await open([
      ...options,
      { ...options[0]!, providerId: 'openai', providerName: 'OpenAI', id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    ]);
    await user.click(screen.getByText('OpenAI'));
    await screen.findByText('gpt-4o-mini');

    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models', 'Remove key']);
    await user.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(repository.clearProviderApiKey).toHaveBeenCalledWith('openai'));
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('claude_code never offers Log out: CLIO has no logout for it', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...defaultConfiguration,
      presets: [
        ...defaultConfiguration.presets,
        {
          id: 'claude_code',
          label: 'Claude Code',
          provider: 'claude_code',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'subscription',
          is_authenticated: true,
          status: 'ready',
        },
      ],
    });
    const user = await open([
      ...options,
      { ...options[0]!, providerId: 'claude_code', providerName: 'Claude Code', id: 'sonnet', label: 'Sonnet' },
    ]);
    await user.click(screen.getByText('Claude Code'));
    await screen.findByText('Sonnet');

    expect(footerButtonNames()).toEqual(['Refresh', 'Reload models']);
  });

  it('Refresh runs one check: the stage shows in the row and the heartbeat, then settles', async () => {
    let finish: (value: unknown) => void = () => {};
    repository.providerHandshake.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    repository.providerModels.mockResolvedValue({ provider_id: 'codex', models: [], source: 'live' });
    const user = await open(options, 'codex');

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const heartbeat = () => screen.getByRole('img', { name: /^Codex status:/u });
    await waitFor(() => expect(heartbeat()).toHaveAttribute('data-state', 'checking'));
    expect(heartbeat()).toHaveAccessibleName('Codex status: Checking…');
    expect(document.querySelector('[data-slot="provider-panel-stage"]')).toHaveTextContent('Checking…');
    expect(screen.getByRole('button', { name: 'Reload models' })).toBeDisabled();

    finish({ connectivity: 'ok', auth: 'ok', models: [], source: 'live', generated_at: '' });
    await waitFor(() => expect(heartbeat()).toHaveAttribute('data-state', 'healthy'));
    // A check never rebinds the running agent, and re-reads only this
    // provider's catalog entry from that same check.
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(repository.providerCatalog).toHaveBeenCalledWith(false, undefined, 'codex'),
    );
    expect(document.querySelector('[data-slot="provider-panel-stage"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload models' })).toBeEnabled();
  });
});

describe('ClioModelPicker: a provider that is not usable yet', () => {
  it('signed out: one sentence and Log in; opening it never starts a flow', async () => {
    repository.languageModelConfiguration.mockResolvedValue(signedOutCodex);
    const user = await open([codexProviderRow, options[1]!]);
    await user.click(screen.getByText('Codex'));

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeVisible();
    expect(sentence()).toHaveTextContent('Log in to Codex to use its models.');
    expect(document.querySelector('[data-slot="provider-panel-footer"]')).toBeNull();
    expect(repository.authenticateProvider).not.toHaveBeenCalled();
  });

  it('Log in: an explicit click starts the sign-in, shows its steps, and completion ends it', async () => {
    repository.languageModelConfiguration.mockResolvedValue(signedOutCodex);
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-1',
      browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?state=1', loopback: true },
      instructions: '',
    });
    repository.providerAuthStatus.mockResolvedValueOnce({ state: 'pending', reason: '' });
    repository.providerAuthStatus.mockResolvedValue({ state: 'complete', reason: '' });
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = await open([codexProviderRow, options[1]!]);
    await user.click(screen.getByText('Codex'));
    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', { force: true, method: 'browser' }),
    );
    expect(windowOpen).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/authorize?state=1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(await screen.findByLabelText('Complete Codex sign-in')).toBeVisible();
    expect(document.querySelector('[data-slot="provider-action-steps"]')).toHaveTextContent(
      'Waiting for you',
    );
    await waitFor(
      () => expect(screen.queryByLabelText('Complete Codex sign-in')).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('install needed: Install, and its failure replaces the sentence', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...defaultConfiguration,
      presets: [
        ...defaultConfiguration.presets,
        {
          id: 'claude_code',
          label: 'Claude Code',
          provider: 'claude_code',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'subscription',
          is_authenticated: false,
          status: 'install_required',
        },
      ],
    });
    repository.installProviderSupport.mockRejectedValueOnce(new Error('Claude Code could not be installed.'));
    const user = await open([
      ...options,
      { providerId: 'claude_code', providerName: 'Claude Code', id: '', kind: 'provider' as const, label: 'Claude Code', available: false, health: 'needs_install' },
    ]);
    await user.click(screen.getByText('Claude Code'));

    expect(sentence()).toHaveTextContent("Claude Code isn't installed yet.");
    await user.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(repository.installProviderSupport).toHaveBeenCalledWith('claude_code'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code could not be installed.');
  });

  it('key needed: the key field and Connect save through the credential API, never a rebind', async () => {
    mockOpenaiApiKeyPreset();
    repository.saveProviderApiKey.mockResolvedValueOnce({ provider_id: 'openai', is_authenticated: true });
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'ok',
      models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
      source: 'live',
      generated_at: '',
    });
    repository.providerModels.mockResolvedValue({ provider_id: 'openai', models: [], source: 'live' });
    const user = await open([...options, openaiOption]);
    await user.click(screen.getByText('OpenAI'));

    expect(sentence()).toHaveTextContent('Add your OpenAI key to use its models.');
    await user.type(await screen.findByLabelText('OpenAI key'), 'sk-test-key');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(repository.saveProviderApiKey).toHaveBeenCalledWith('openai', 'sk-test-key'));
    await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('while the key is saved, the steps replace the field and the stale sentence', async () => {
    mockOpenaiApiKeyPreset();
    let finish: (value: unknown) => void = () => {};
    repository.saveProviderApiKey.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'ok',
      models: [],
      source: 'live',
      generated_at: '',
    });
    repository.providerModels.mockResolvedValue({ provider_id: 'openai', models: [], source: 'live' });
    const user = await open([...options, openaiOption]);
    await user.click(screen.getByText('OpenAI'));
    await user.type(await screen.findByLabelText('OpenAI key'), 'sk-test-key');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() =>
      expect(document.querySelector('[data-slot="provider-action-steps"]')).toHaveTextContent(
        'Saving your key…',
      ),
    );
    expect(screen.queryByLabelText('OpenAI key')).toBeNull();
    finish({ provider_id: 'openai', is_authenticated: true });
    await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
  });

  it('a fake key ends on ONE plain sentence, from ONE check', async () => {
    mockOpenaiApiKeyPreset();
    repository.saveProviderApiKey.mockResolvedValueOnce({ provider_id: 'openai', is_authenticated: true });
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'rejected',
      error: 'api_key_rejected: the provider refused the API key (HTTP 401)',
      models: [],
      source: 'live',
      generated_at: '',
    });
    const user = await open([...options, openaiOption]);
    await user.click(screen.getByText('OpenAI'));
    await user.type(await screen.findByLabelText('OpenAI key'), 'sk-fake');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your OpenAI API key was rejected.');
    expect(screen.getAllByText('Your OpenAI API key was rejected.')).toHaveLength(1);
    expect(screen.queryByText(/api_key_rejected/u)).toBeNull();
    // The field comes back for a new key.
    expect(screen.getByLabelText('OpenAI key')).toBeVisible();
    expect(repository.providerHandshake).toHaveBeenCalledTimes(1);
    expect(repository.providerModels).not.toHaveBeenCalled();
    expect(repository.providerCatalog.mock.calls).toContainEqual([false, undefined, 'openai']);
  });

  it('a rejected key: red heartbeat, no count, the reason once, and a field for a new key', async () => {
    mockOpenaiApiKeyPreset();
    const user = await open([
      ...options,
      { ...openaiOption, availabilityDetail: 'Your OpenAI API key was rejected.' },
    ]);
    const row = screen.getByText('OpenAI').closest('[data-slot="cascader-item"]');
    expect(row?.querySelector('[data-slot="provider-heartbeat"]')).toHaveAttribute('data-state', 'unavailable');
    expect(row?.querySelector('[data-slot="cascader-item-count"]')).toBeNull();

    await user.click(screen.getByText('OpenAI'));
    expect(sentence()).toHaveTextContent('Your OpenAI API key was rejected.');
    expect(screen.getAllByText('Your OpenAI API key was rejected.')).toHaveLength(1);
    expect(screen.getByLabelText('OpenAI key')).toBeVisible();
  });

  it('a session ALCF itself refuses: ONE "Sign in again", never the reason code', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...defaultConfiguration,
      presets: [
        ...defaultConfiguration.presets,
        {
          id: 'argonne_sophia',
          label: 'ALCF Sophia',
          provider: 'argonne',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'oauth',
          is_authenticated: true,
          status: 'ready',
          status_message: 'argonne_reauthentication_required: Globus high-assurance timeout',
          supports_logout: true,
        },
      ],
    });
    const user = await open([
      ...options,
      {
        providerId: 'argonne_sophia',
        providerName: 'ALCF Sophia',
        id: '',
        kind: 'provider' as const,
        label: 'ALCF Sophia',
        available: false,
        health: 'unavailable',
        availabilityDetail: 'Your ALCF session needs to be verified again. Sign in again to continue.',
      },
    ]);
    await user.click(screen.getByText('ALCF Sophia'));

    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
    expect(screen.queryByText(/argonne_reauthentication_required/u)).toBeNull();
  });

  it('a refusal the catalog reports (not the preset) also offers "Sign in again", not "Check again"', async () => {
    // The owner's state: the preset still reads ready; only the live catalog
    // check came back with the typed reauthentication reason.
    repository.languageModelConfiguration.mockResolvedValue({
      ...defaultConfiguration,
      presets: [
        ...defaultConfiguration.presets,
        {
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'oauth',
          is_authenticated: true,
          status: 'ready',
          supports_logout: true,
        },
      ],
    });
    const user = await open([
      ...options,
      {
        providerId: 'argonne_metis',
        providerName: 'ALCF Metis',
        id: '',
        kind: 'provider' as const,
        label: 'ALCF Metis',
        available: false,
        health: 'unavailable',
        failure: 'argonne_reauthentication_required: Token is either not active or invalid',
        availabilityDetail: 'Your ALCF session needs to be verified again. Sign in again to continue.',
      },
    ]);
    await user.click(screen.getByText('ALCF Metis'));

    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    // The sentence and the button say the same thing.
    expect(sentence()).toHaveTextContent('Your ALCF session needs to be verified again.');
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    // The forced log in: a fresh sign-in, not a replay of the refused one.
    expect(repository.authenticateProvider).toHaveBeenCalledWith('argonne_metis', {
      force: true,
      method: 'browser',
    });
  });

  it('a server on this computer that is not answering is grey "Not running", never red', async () => {
    const user = await open(
      options.map((option) => (option.providerId === 'local-vllm' ? { ...option, health: 'unavailable' } : option)),
    );
    const row = screen.getByText('Local vLLM').closest('[data-slot="cascader-item"]');
    const heartbeat = row?.querySelector('[data-slot="provider-heartbeat"]');
    expect(heartbeat).toHaveAttribute('data-state', 'setup');
    expect(heartbeat).not.toHaveClass('text-destructive');
    expect(heartbeat).toHaveAccessibleName('Local vLLM status: Not running');
    expect(row?.querySelector('[data-slot="cascader-item-count"]')).toBeNull();
    await user.click(screen.getByText('Local vLLM'));
    // Its dated rows stay out of the list until it answers again.
    expect(screen.queryByText('Qwen3-VL-32B')).toBeNull();
    expect(sentence()).toHaveTextContent("Local vLLM isn't running. Start it, then check again.");
    expect(await screen.findByRole('button', { name: 'Check again' })).toBeVisible();
  });

  it('a sign-in that ends in failure says why, in place of the sentence', async () => {
    repository.languageModelConfiguration.mockResolvedValue(signedOutCodex);
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-9',
      browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?state=9', loopback: true },
      instructions: '',
    });
    repository.providerAuthStatus.mockResolvedValue({ state: 'failed', reason: 'The sign-in was cancelled.' });
    vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = await open([codexProviderRow, options[1]!]);
    await user.click(screen.getByText('Codex'));
    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'The sign-in was cancelled.',
    );
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  });
});
