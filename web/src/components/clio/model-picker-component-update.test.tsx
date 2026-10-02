import type {
  ProviderClientFact,
  ProviderComponentUpdate,
  ProviderComponents,
} from '@clio/core/v3';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  defaultConfiguration,
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

const installedClient: ProviderClientFact = {
  source: 'installed',
  version: '2.1.276',
  path: 'C:/npm/claude.exe',
  reason: 'claude_installed_newer',
  installed_version: '2.1.276',
  bundled_version: '2.1.270',
};

const claudeCodeConfiguration = {
  ...defaultConfiguration,
  provider_id: 'claude_code',
  provider: 'claude_code',
  model: 'claude-sonnet-5',
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
    },
  ],
};

const claudeCodeOption = {
  providerId: 'claude_code',
  providerName: 'Claude Code',
  id: 'claude-sonnet-5',
  label: 'Sonnet',
  available: true,
  endpoint: 'claude-code://sdk',
  configurationUrl: '/settings/providers?provider=claude_code',
  freshness: '2026-08-31T12:00:00Z',
  health: 'ready',
  modalities: ['text', 'image'],
};

function components(overrides: Partial<ProviderComponents> = {}): ProviderComponents {
  return {
    provider_id: 'claude_code',
    provider_kind: 'claude_code',
    installed: true,
    update_available: true,
    target_version: '0.1.64',
    release_notes_url: 'https://github.com/anthropics/claude-agent-sdk-python/releases',
    checked_at: '2026-09-26T00:00:00Z',
    components: [
      {
        distribution: 'claude-agent-sdk',
        installed_version: '0.1.63',
        latest_version: '0.1.64',
        update_available: true,
      },
    ],
    client: installedClient,
    ...overrides,
  };
}

function job(overrides: Partial<ProviderComponentUpdate>): ProviderComponentUpdate {
  return {
    provider_kind: 'claude_code',
    stage: 'checking',
    running: true,
    from_versions: { 'claude-agent-sdk': '0.1.63' },
    to_versions: { 'claude-agent-sdk': '0.1.64' },
    changed: false,
    rolled_back: false,
    restart_required: false,
    started_at: '2026-09-26T00:00:01Z',
    finished_at: '',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  for (const mock of Object.values(repository)) mock.mockReset();
});

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(claudeCodeConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
  repository.providerModels.mockResolvedValue({
    provider_id: 'claude_code',
    models: [],
    source: 'live',
  });
  repository.providerHandshake.mockResolvedValue({ connectivity: 'ok', auth: 'ok', models: [] });
});

async function openClaudeCode(client: ProviderClientFact | null = installedClient) {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker
      model="claude-sonnet-5"
      onChange={vi.fn()}
      options={[...options, { ...claudeCodeOption, client: client ?? undefined }]}
      provider="claude_code"
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

function statusRow(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="provider-component-status"]')!;
}

function claudeCodeHeartbeat(): HTMLElement {
  return screen.getByRole('img', { name: /^Claude Code status:/u });
}

describe('ClioModelPicker: provider SDK update (Claude Code)', () => {
  it('shows the version fact and "Update available" next to it', async () => {
    repository.providerComponents.mockResolvedValue(components());
    await openClaudeCode();

    expect(await within(statusRow()).findByText('Update available: 0.1.64')).toBeVisible();
    expect(within(statusRow()).getByText('Installed Claude Code 2.1.276')).toBeVisible();
    expect(within(statusRow()).getByRole('button', { name: 'Update' })).toBeVisible();
    expect(repository.providerComponents).toHaveBeenCalledWith('claude_code', {}, expect.anything());
  });

  it('shows only the fact when the SDK is current', async () => {
    repository.providerComponents.mockResolvedValue(
      components({ update_available: false, target_version: '0.1.63' }),
    );
    await openClaudeCode({ ...installedClient, source: 'bundled', version: '2.1.270' });

    expect(await within(statusRow()).findByText('Bundled Claude Code 2.1.270')).toBeVisible();
    await waitFor(() => expect(repository.providerComponents).toHaveBeenCalled());
    expect(within(statusRow()).queryByRole('button', { name: 'Update' })).toBeNull();
    expect(within(statusRow()).queryByText(/Update available/u)).toBeNull();
  });

  it('never asks for components when the service reports no client (older service, other providers)', async () => {
    await openClaudeCode(null);
    expect(document.querySelector('[data-slot="provider-component-status"]')).toBeNull();
    expect(repository.providerComponents).not.toHaveBeenCalled();
  });

  it('Update shows each stage in the panel and on the yellow heartbeat, then re-checks the provider', async () => {
    repository.providerComponents.mockResolvedValue(components());
    repository.updateProviderComponents.mockResolvedValue(job({ stage: 'checking' }));
    repository.providerComponentUpdate
      .mockResolvedValueOnce(job({ stage: 'downloading' }))
      .mockResolvedValueOnce(job({ stage: 'installing' }))
      .mockResolvedValue(job({ stage: 'done', running: false, changed: true, finished_at: 'x' }));
    const user = await openClaudeCode();

    await user.click(await within(statusRow()).findByRole('button', { name: 'Update' }));

    expect(await within(statusRow()).findByText('Downloading…')).toBeVisible();
    expect(claudeCodeHeartbeat()).toHaveAttribute('data-state', 'checking');
    expect(claudeCodeHeartbeat()).toHaveAccessibleName('Claude Code status: Downloading…');
    expect(
      await within(statusRow()).findByText('Installing…', {}, { timeout: 3000 }),
    ).toBeVisible();
    await waitFor(
      () =>
        expect(repository.providerHandshake).toHaveBeenCalledWith(
          'claude_code',
          expect.objectContaining({ refresh: true }),
        ),
      {
        timeout: 3000,
      },
    );
    expect(repository.updateProviderComponents).toHaveBeenCalledWith('claude_code');
  });

  it('a failed update says what it kept, with the reason behind the info tip', async () => {
    repository.providerComponents.mockResolvedValue(
      components({
        update: job({
          stage: 'failed',
          running: false,
          rolled_back: true,
          error: { code: 'verify_failed', message: 'import failed' },
        }),
      }),
    );
    await openClaudeCode();

    expect(await within(statusRow()).findByText('Update failed. Kept 0.1.63.')).toBeVisible();
    expect(
      within(statusRow()).getByRole('button', { name: 'Why the update failed' }),
    ).toBeVisible();
    expect(repository.providerHandshake).not.toHaveBeenCalled();
  });

  it('an update that needs a restart says so instead of re-checking', async () => {
    repository.providerComponents.mockResolvedValue(
      components({
        update_available: false,
        update: job({ stage: 'done', running: false, changed: true, restart_required: true }),
      }),
    );
    await openClaudeCode();

    expect(await within(statusRow()).findByText(/to finish$/u)).toBeVisible();
    expect(repository.providerHandshake).not.toHaveBeenCalled();
  });

  it('picks up an update already running when the panel opens', async () => {
    repository.providerComponents.mockResolvedValue(
      components({ update: job({ stage: 'verifying' }) }),
    );
    repository.providerComponentUpdate.mockResolvedValue(job({ stage: 'verifying' }));
    await openClaudeCode();

    expect(await within(statusRow()).findByText('Verifying…')).toBeVisible();
    expect(within(statusRow()).queryByRole('button', { name: 'Update' })).toBeNull();
  });
});
