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

describe('ClioModelPicker provider submenu: exact action set and progress per state', () => {
  it("Codex Direct signed in: Sign out comes from the transport's own auth.logout", async () => {
    const transports = [
      { id: 'sdk', label: 'Codex (local)', health: 'ready', reason: '' },
      {
        id: 'direct',
        label: 'Direct',
        health: 'ready',
        reason: '',
        auth: { method: 'oauth', logout: true },
      },
    ];
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        model="gpt-5.6-luna"
        onChange={vi.fn()}
        // Both transports report the SAME model id: each half keeps its row.
        options={options.flatMap((option) =>
          option.providerId === 'codex'
            ? [
                { ...option, transport: 'sdk', transports },
                { ...option, transport: 'direct', transports },
              ]
            : [option],
        )}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models', 'Sign out']);
    expect(screen.getAllByText('Luna')).toHaveLength(2);
  });

  it('ALCF signed in: Verify provider, Refresh models and Sign out', async () => {
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
          supports_logout: true,
        },
      ],
    });
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[
          ...options,
          {
            providerId: 'argonne_sophia',
            providerName: 'ALCF Sophia',
            id: 'llama',
            label: 'Llama',
            available: true,
            health: 'ready',
          },
        ]}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF Sophia'));

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models', 'Sign out']);
  });

  it('ALCF re-authentication required: ONE "Sign in again", never the raw reason code', async () => {
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
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[
          ...options,
          {
            providerId: 'argonne_sophia',
            providerName: 'ALCF Sophia',
            id: '',
            kind: 'provider' as const,
            label: 'ALCF Sophia',
            available: false,
            health: 'unavailable',
            availabilityDetail:
              'Your ALCF session needs to be verified again. Sign in again to continue.',
          },
        ]}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF Sophia'));

    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeVisible();
    expect(stripButtonNames()).toEqual(['Sign in again']);
    expect(screen.queryByText(/argonne_reauthentication_required/u)).not.toBeInTheDocument();
  });

  it('API key needed: exactly the key field and Save key -- nothing to verify yet', async () => {
    mockOpenaiApiKeyPreset();
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

    expect(await screen.findByLabelText('OpenAI API key')).toBeVisible();
    expect(stripButtonNames()).toEqual(['Save key']);
  });

  it('while an action runs: yellow heartbeat and the stage in the strip and bottom bar, then it settles', async () => {
    let finishHandshake: (value: unknown) => void = () => {};
    repository.providerHandshake.mockReturnValueOnce(
      new Promise((resolve) => {
        finishHandshake = resolve;
      }),
    );
    repository.providerModels.mockResolvedValue({
      provider_id: 'codex',
      models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
      source: 'codex_catalog',
    });
    repository.providerCatalog.mockResolvedValue({
      authoritative: 'live_handshake',
      providers: [],
    });
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
    await user.click(await screen.findByRole('button', { name: 'Verify provider' }));

    const codexHeartbeat = () => screen.getByRole('img', { name: /^Codex status:/u });
    await waitFor(() => expect(codexHeartbeat()).toHaveAttribute('data-state', 'checking'));
    expect(codexHeartbeat()).toHaveAccessibleName('Codex status: Verifying…');
    expect(codexHeartbeat()).toHaveClass('text-warning');
    expect(document.querySelector('[data-slot="provider-action-stage"]')).toHaveTextContent(
      'Verifying…',
    );
    expect(document.querySelector('[data-slot="provider-action-footer-stage"]')).toHaveTextContent(
      'Codex: Verifying…',
    );
    // One action at a time.
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeDisabled();

    finishHandshake({
      connectivity: 'ok',
      auth: 'ok',
      models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
      source: 'codex_catalog',
      generated_at: '2026-09-01T00:00:00Z',
    });

    await waitFor(() => expect(codexHeartbeat()).toHaveAttribute('data-state', 'healthy'));
    expect(codexHeartbeat()).toHaveClass('text-success');
    expect(document.querySelector('[data-slot="provider-action-stage"]')).toBeNull();
    expect(document.querySelector('[data-slot="provider-action-footer-stage"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeEnabled();
  });

  it('Save key hides the stale "add your key" error behind the running stage', async () => {
    mockOpenaiApiKeyPreset();
    let finishSave: (value: unknown) => void = () => {};
    repository.saveProviderApiKey.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'ok',
      models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
      source: 'live',
      generated_at: '2026-09-25T00:00:00Z',
    });
    repository.providerModels.mockResolvedValue({
      provider_id: 'openai',
      models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
      source: 'live',
    });
    repository.providerCatalog.mockResolvedValue({
      authoritative: 'live_handshake',
      providers: [],
    });
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[...options, { ...openaiOption, availabilityDetail: 'Add your OpenAI API key.' }]}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('OpenAI'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add your OpenAI API key.');
    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-test-key');
    await user.click(screen.getByRole('button', { name: 'Save key' }));

    await waitFor(() =>
      expect(document.querySelector('[data-slot="provider-action-stage"]')).toHaveTextContent(
        'Saving key…',
      ),
    );
    expect(screen.queryByText('Add your OpenAI API key.')).not.toBeInTheDocument();

    finishSave({ provider_id: 'openai', is_authenticated: true, instructions: 'Saved.' });

    await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
    await waitFor(() =>
      expect(document.querySelector('[data-slot="provider-action-stage"]')).toBeNull(),
    );
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });
});
