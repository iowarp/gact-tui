import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnSignInProvider } from '@/lib/turn-sign-in-provider';
import { TurnProviderSignIn } from './turn-provider-sign-in';

const { repository } = vi.hoisted(() => ({
  repository: {
    languageModelConfiguration: vi.fn(),
    providerHandshake: vi.fn(),
    providerModels: vi.fn(),
    providerCatalog: vi.fn(),
    authenticateProvider: vi.fn(),
    completeProviderAuthentication: vi.fn(),
    providerAuthStatus: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function preset(overrides: Record<string, unknown>) {
  return {
    requires_api_key: false,
    auth_method: 'subscription',
    is_authenticated: false,
    supports_live_catalog: true,
    suggested_model: '',
    ...overrides,
  };
}

function renderSignIn(providerId: string, providerLabel: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TurnProviderSignIn providerId={providerId} providerLabel={providerLabel} />
    </QueryClientProvider>,
  );
}

describe('turnSignInProvider', () => {
  it('names the provider of a typed refused sign-in', () => {
    expect(
      turnSignInProvider({
        error: 'provider_error',
        details: {
          reason: 'provider_auth_required',
          provider_id: 'claude_code',
          provider_label: 'Claude Code',
        },
      }),
    ).toEqual({ id: 'claude_code', label: 'Claude Code' });
  });

  it('offers nothing for any other provider failure', () => {
    expect(
      turnSignInProvider({ error: 'provider_error', details: { provider_id: 'claude_code' } }),
    ).toBeUndefined();
    expect(
      turnSignInProvider({
        error: 'provider_error',
        details: { reason: 'provider_auth_required' },
      }),
    ).toBeUndefined();
    expect(turnSignInProvider(undefined)).toBeUndefined();
  });
});

describe('TurnProviderSignIn', () => {
  it('signs in to Claude Code again through its own CLI sign-in', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      presets: [preset({ id: 'claude_code', label: 'Claude Code', provider: 'claude_code' })],
    });
    repository.authenticateProvider.mockResolvedValue({
      provider_id: 'claude_code',
      flow_id: 'flow_1',
      browser: { authorization_url: 'https://claude.com/cai/oauth/authorize?x=1', loopback: false },
    });
    repository.providerAuthStatus.mockResolvedValue({ state: 'pending' });
    const user = userEvent.setup();
    renderSignIn('claude_code', 'Claude Code');

    await user.click(await screen.findByRole('button', { name: /Sign in again/ }));

    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith(
        'claude_code',
        expect.objectContaining({ force: true }),
      ),
    );
    expect(await screen.findByRole('link', { name: /Open sign-in page/ })).toHaveAttribute(
      'href',
      'https://claude.com/cai/oauth/authorize?x=1',
    );
  });

  it('checks a provider that has no sign-in of its own', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      presets: [
        preset({ id: 'lm_studio', label: 'LM Studio', provider: 'lm_studio', auth_method: 'none' }),
      ],
    });
    repository.providerHandshake.mockResolvedValue({ connectivity: 'ok', auth: 'ok' });
    repository.providerModels.mockResolvedValue({ models: [] });
    repository.providerCatalog.mockResolvedValue({ providers: [] });
    const user = userEvent.setup();
    renderSignIn('lm_studio', 'LM Studio');

    await user.click(await screen.findByRole('button', { name: 'Check' }));

    await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
    expect(repository.authenticateProvider).not.toHaveBeenCalled();
  });

  it('offers the browser sign-in for a provider CLIO signs in itself', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      presets: [
        preset({
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          auth_method: 'oauth',
        }),
      ],
    });
    renderSignIn('argonne_metis', 'ALCF Metis');

    expect(await screen.findByRole('button', { name: /Sign in again/ })).toBeInTheDocument();
  });
});
