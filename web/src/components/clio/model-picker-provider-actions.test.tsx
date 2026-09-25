import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  defaultConfiguration,
  mockOpenaiApiKeyPreset,
  openaiOption,
  options,
  renderPicker,
  repository,
  setWideViewport,
  stripButtonNames,
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
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
});

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
});

describe('ClioModelPicker provider submenu actions', () => {
    it('signed out: opening the submenu never starts a flow on its own', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: false } : preset,
        ),
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Change model</Button>} />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByRole('option', { name: /Codex/ }));
      await screen.findByRole('button', { name: 'Sign in' });

      expect(repository.authenticateProvider).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Complete Codex sign-in')).not.toBeInTheDocument();
    });

    it('signed out: an explicit click starts browser sign-in, and completion switches to the model list', async () => {
      repository.languageModelConfiguration.mockResolvedValueOnce({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: false } : preset,
        ),
      });
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: true } : preset,
        ),
      });
      repository.authenticateProvider.mockResolvedValueOnce({
        provider_id: 'codex',
        flow_id: 'flow-1',
        browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?state=1', loopback: true },
        instructions: 'Continue in the browser, then paste the redirect URL here.',
      });
      repository.providerAuthStatus.mockResolvedValueOnce({ state: 'pending', reason: '' });
      repository.providerAuthStatus.mockResolvedValue({ state: 'complete', reason: '' });
      repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
      const open = vi.spyOn(window, 'open').mockImplementation(() => window);
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Change model</Button>} />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByRole('option', { name: /Codex/ }));
      expect(repository.authenticateProvider).not.toHaveBeenCalled();

      await user.click(await screen.findByRole('button', { name: 'Sign in' }));

      await waitFor(() =>
        expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', {
          force: true,
          method: 'browser',
        }),
      );
      expect(open).toHaveBeenCalledWith(
        'https://auth.openai.com/oauth/authorize?state=1',
        '_blank',
        'noopener,noreferrer',
      );
      expect(await screen.findByLabelText('Complete Codex sign-in')).toBeVisible();

      // The flow completes on its own (loopback callback) -- polling picks it
      // up without any further click. Timeout exceeds the poll interval's
      // ceiling (2000ms) so this does not race the real backoff.
      await waitFor(
        () => expect(screen.queryByLabelText('Complete Codex sign-in')).not.toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('install required: installs the runtime and shows its typed error in place on failure', async () => {
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
      repository.installProviderSupport.mockRejectedValueOnce(new Error('Claude Code CLI not found'));
      const claudeOption = {
        providerId: 'claude_code',
        providerName: 'Claude Code',
        id: '',
        kind: 'provider' as const,
        label: 'Claude Code',
        available: false,
        health: 'unavailable',
      };
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, claudeOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('Claude Code'));
      await user.click(await screen.findByRole('button', { name: 'Install' }));

      await waitFor(() => expect(repository.installProviderSupport).toHaveBeenCalledWith('claude_code'));
      expect(await screen.findByText('Claude Code CLI not found')).toBeVisible();
    });

    it('API key needed: saves the key through the credential API, never PUT /v1/providers/lm', async () => {
      mockOpenaiApiKeyPreset();
      repository.saveProviderApiKey.mockResolvedValueOnce({
        provider_id: 'openai',
        is_authenticated: true,
        instructions: 'Saved the OpenAI API key. Checking available models.',
      });
      repository.providerHandshake.mockResolvedValueOnce({
        connectivity: 'ok',
        auth: 'ok',
        models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
        source: 'live',
        generated_at: '2026-09-25T00:00:00Z',
      });
      repository.providerModels.mockResolvedValueOnce({
        provider_id: 'openai',
        models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
        source: 'live',
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, openaiOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('OpenAI'));
      await user.type(await screen.findByLabelText('OpenAI API key'), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: 'Save key' }));

      // Stores the credential and verifies it -- but NEVER rebinds the
      // active provider (#1446 follow-up: saving OpenAI's key must not
      // switch the running agent onto it).
      await waitFor(() =>
        expect(repository.saveProviderApiKey).toHaveBeenCalledWith('openai', 'sk-test-key'),
      );
      expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
      await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
    });

    it('API key needed: an invalid key settles to a typed error, never stuck on "Saving..."', async () => {
      mockOpenaiApiKeyPreset();
      repository.saveProviderApiKey.mockResolvedValueOnce({
        provider_id: 'openai',
        is_authenticated: true,
        instructions: 'Saved the OpenAI API key. Checking available models.',
      });
      repository.providerHandshake.mockResolvedValueOnce({
        connectivity: 'ok',
        auth: 'rejected',
        error: 'provider connectivity or authentication check failed',
        models: [],
        source: 'live',
        generated_at: '2026-09-25T00:00:00Z',
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, openaiOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('OpenAI'));
      await user.type(await screen.findByLabelText('OpenAI API key'), 'sk-bad-key');
      const saveButton = screen.getByRole('button', { name: 'Save key' });
      await user.click(saveButton);

      // The raw backend sentence is translated -- never shown verbatim --
      // and the button is never left stuck on "Saving..." once the attempt
      // has settled (#1446 follow-up).
      expect(await screen.findByText("Couldn't reach OpenAI or confirm your sign-in.")).toBeVisible();
      expect(screen.getByRole('button', { name: 'Save key' })).toBeEnabled();
    });

    it('removes a ready key for a provider that is NOT the active default via clear_api_key, never a rebind', async () => {
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
      repository.clearProviderApiKey.mockResolvedValueOnce({
        provider_id: 'openai',
        is_authenticated: false,
        instructions: 'Removed the OpenAI API key.',
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, openaiOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('OpenAI'));
      await user.click(await screen.findByRole('button', { name: 'Remove key' }));

      // codex, not openai, stays the configured/default provider throughout.
      await waitFor(() => expect(repository.clearProviderApiKey).toHaveBeenCalledWith('openai'));
      expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    });

    it('ready: shows Verify provider, Refresh models and Sign out -- never a bare icon', async () => {
      repository.providerHandshake.mockResolvedValueOnce({
        connectivity: 'ok',
        auth: 'ok',
        models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
        source: 'codex_catalog',
        generated_at: '2026-09-01T00:00:00Z',
      });
      repository.refreshProviderModels.mockResolvedValueOnce([
        {
          provider: 'codex',
          discovered: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
          source: 'codex_catalog',
          default_model: 'gpt-5.6-luna',
          generated_at: '2026-09-01T00:00:00Z',
          added: [],
          removed: [],
          unchanged: ['gpt-5.6-luna'],
          rejected: [],
        },
      ]);
      repository.providerModels.mockResolvedValue({
        provider_id: 'codex',
        models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
        source: 'codex_catalog',
      });
      repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));

      // The exact ready-state action set -- labelled buttons, never the old
      // bare status-icon control, and Sign out since Codex's preset reports
      // supports_logout.
      expect(await screen.findByRole('button', { name: 'Verify provider' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Refresh models' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
      expect(screen.queryByRole('button', { name: /^Check /u })).not.toBeInTheDocument();
      expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models', 'Sign out']);

      await user.click(screen.getByRole('button', { name: 'Verify provider' }));
      await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());

      // "Refresh models" re-runs REAL discovery for this provider, never
      // just a catalog re-read.
      await user.click(screen.getByRole('button', { name: 'Refresh models' }));
      await waitFor(() =>
        expect(repository.refreshProviderModels).toHaveBeenCalledWith(['codex']),
      );
    });

    it('claude_code ready never shows Sign out -- CLIO has no logout handler for it', async () => {
      // Claude Code's subscription is the user's own Claude CLI login, which
      // CLIO does not own and cannot revoke -- unlike Codex above (same
      // auth_method: 'subscription'), it has no entry in the backend's
      // logout registry, so `supports_logout` is the only thing that may
      // ever gate this button, never `auth_method`.
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: [
          ...defaultConfiguration.presets,
          {
            id: 'claude_code',
            label: 'Claude Code',
            provider: 'claude_code',
            suggested_model: 'claude-sonnet-5',
            requires_api_key: false,
            auth_method: 'subscription',
            is_authenticated: true,
            status: 'ready',
            supports_logout: false,
          },
        ],
      });
      const claudeOption = {
        providerId: 'claude_code',
        providerName: 'Claude Code',
        id: 'claude-sonnet-5',
        label: 'Sonnet',
        available: true,
        health: 'ready',
      };
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, claudeOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('Claude Code'));

      expect(await screen.findByRole('button', { name: 'Verify provider' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Refresh models' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
      expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models']);
    });

    it('single-transport providers (no transports, or exactly one) never show the "or" divider', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: [
          ...defaultConfiguration.presets,
          {
            id: 'alcf',
            label: 'ALCF',
            provider: 'argonne',
            suggested_model: '',
            requires_api_key: false,
            auth_method: 'oauth',
            is_authenticated: false,
            transports: [{ id: 'globus', label: 'Globus', health: 'unavailable' }],
          },
        ],
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={[
            ...options,
            {
              providerId: 'alcf',
              providerName: 'ALCF',
              id: '',
              kind: 'provider' as const,
              label: 'ALCF',
              available: false,
              health: 'unavailable',
            },
          ]}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      expect(screen.queryByText('or')).not.toBeInTheDocument();

      await user.click(screen.getByText('ALCF'));
      await screen.findByRole('button', { name: 'Sign in' });
      expect(screen.queryByText('or')).not.toBeInTheDocument();
    });

    it('a provider with more than one transport splits into two halves, "or" between them', async () => {
      // Transports live on the CATALOG entry (what `options` models this
      // fixture), never on the preset -- the picker must never invent this
      // shape from anything else.
      const transports = [
        { id: 'sdk', label: 'Codex (local)', health: 'ready', reason: '' },
        {
          id: 'direct',
          label: 'Direct',
          health: 'unavailable',
          reason: '',
          auth: { method: 'subscription' },
        },
      ];
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={options.map((option) =>
            option.providerId === 'codex' ? { ...option, transport: 'sdk', transports } : option,
          )}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));

      // Never hardcoded per provider: the split renders purely because THIS
      // provider's catalog entry reports more than one transport. The ready
      // SDK half gets its own heading + models INSIDE the tree; "or" then
      // separates it from the signed-out Direct half's action below.
      expect(screen.getByText('Codex (local)')).toBeVisible();
      expect(screen.getByText('Luna')).toBeVisible();
      expect(screen.getByText('or')).toBeVisible();
      expect(screen.getByText('Direct')).toBeVisible();
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
      // The ready SDK half gets the ready actions -- but no Sign out: the SDK
      // is the user's own Codex login, and Direct (the only transport CLIO
      // can sign out of) is not signed in.
      expect(stripButtonNames()).toEqual([
        'Verify provider',
        'Refresh models',
        'Sign in',
        'Device code',
      ]);
    });
});
