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
  codexOptions,
  codexTransports,
  defaultConfiguration,
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
  version: '0.157.1',
  path: 'C:/npm/codex.exe',
  reason: 'codex_installed_cli',
  installed_version: '0.157.1',
  bundled_version: '0.147.0',
};

function components(overrides: Partial<ProviderComponents> = {}): ProviderComponents {
  return {
    provider_id: 'codex',
    provider_kind: 'codex',
    installed: true,
    update_available: true,
    target_version: '0.158.0',
    release_notes_url: 'https://github.com/openai/codex/releases',
    checked_at: '2026-09-26T00:00:00Z',
    components: [
      {
        distribution: 'openai-codex',
        installed_version: '0.157.1',
        latest_version: '0.158.0',
        update_available: true,
      },
      {
        distribution: 'openai-codex-cli-bin',
        installed_version: '0.157.1',
        latest_version: '0.158.0',
        update_available: true,
      },
    ],
    client: installedClient,
    ...overrides,
  };
}

function job(overrides: Partial<ProviderComponentUpdate>): ProviderComponentUpdate {
  return {
    provider_kind: 'codex',
    stage: 'checking',
    running: true,
    from_versions: { 'openai-codex': '0.157.1', 'openai-codex-cli-bin': '0.157.1' },
    to_versions: { 'openai-codex': '0.158.0', 'openai-codex-cli-bin': '0.158.0' },
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
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
  repository.providerModels.mockResolvedValue({ provider_id: 'codex', models: [], source: 'live' });
  repository.providerHandshake.mockResolvedValue({ connectivity: 'ok', auth: 'ok', models: [] });
});

async function openCodex(client: ProviderClientFact | null = installedClient) {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker
      model="gpt-5.6-luna"
      onChange={vi.fn()}
      options={codexOptions(codexTransports('ready')).map((option) =>
        option.providerId === 'codex' ? { ...option, client: client ?? undefined } : option,
      )}
      provider="codex"
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

function statusRow(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="provider-component-status"]')!;
}

function codexHeartbeat(): HTMLElement {
  return screen.getByRole('img', { name: /^Codex status:/u });
}

describe('ClioModelPicker: provider SDK update (Codex)', () => {
  it('shows the version fact and "Update available" next to it', async () => {
    repository.providerComponents.mockResolvedValue(components());
    await openCodex();

    expect(await within(statusRow()).findByText('Update available: 0.158.0')).toBeVisible();
    expect(within(statusRow()).getByText('Installed Codex 0.157.1')).toBeVisible();
    expect(within(statusRow()).getByRole('button', { name: 'Update' })).toBeVisible();
    expect(repository.providerComponents).toHaveBeenCalledWith('codex', {}, expect.anything());
  });

  it('shows only the fact when the SDK is current', async () => {
    repository.providerComponents.mockResolvedValue(
      components({ update_available: false, target_version: '0.157.1' }),
    );
    await openCodex({ ...installedClient, source: 'bundled', version: '0.147.0' });

    expect(await within(statusRow()).findByText('Bundled Codex 0.147.0')).toBeVisible();
    await waitFor(() => expect(repository.providerComponents).toHaveBeenCalled());
    expect(within(statusRow()).queryByRole('button', { name: 'Update' })).toBeNull();
    expect(within(statusRow()).queryByText(/Update available/u)).toBeNull();
  });

  it('never asks for components when the service reports no client (older service, other providers)', async () => {
    await openCodex(null);
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
    const user = await openCodex();

    await user.click(await within(statusRow()).findByRole('button', { name: 'Update' }));

    expect(await within(statusRow()).findByText('Downloading…')).toBeVisible();
    expect(codexHeartbeat()).toHaveAttribute('data-state', 'checking');
    expect(codexHeartbeat()).toHaveAccessibleName('Codex status: Downloading…');
    expect(
      await within(statusRow()).findByText('Installing…', {}, { timeout: 3000 }),
    ).toBeVisible();
    await waitFor(
      () =>
        expect(repository.providerHandshake).toHaveBeenCalledWith(
          'codex',
          expect.objectContaining({ refresh: true }),
        ),
      {
        timeout: 3000,
      },
    );
    expect(repository.updateProviderComponents).toHaveBeenCalledWith('codex');
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
    await openCodex();

    expect(await within(statusRow()).findByText('Update failed. Kept 0.157.1.')).toBeVisible();
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
    await openCodex();

    expect(await within(statusRow()).findByText(/to finish$/u)).toBeVisible();
    expect(repository.providerHandshake).not.toHaveBeenCalled();
  });

  it('picks up an update already running when the panel opens', async () => {
    repository.providerComponents.mockResolvedValue(
      components({ update: job({ stage: 'verifying' }) }),
    );
    repository.providerComponentUpdate.mockResolvedValue(job({ stage: 'verifying' }));
    await openCodex();

    expect(await within(statusRow()).findByText('Verifying…')).toBeVisible();
    expect(within(statusRow()).queryByRole('button', { name: 'Update' })).toBeNull();
  });
});
