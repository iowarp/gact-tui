import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
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
});

const VLLM_DOWN = "server_not_running: Local vLLM isn't running at 127.0.0.1:8000.";

function footerAlert(): HTMLElement | null {
  return document.querySelector('[data-slot="provider-panel-footer"] [role="alert"]');
}

function stage(): HTMLElement | null {
  return document.querySelector('[data-slot="provider-panel-stage"]');
}

function refreshFailure(provider: string, reason: string, generatedAt = '2026-09-27T12:00:00Z') {
  return [
    {
      provider,
      discovered: [],
      source: 'live_handshake',
      default_model: '',
      generated_at: generatedAt,
      added: [],
      removed: [],
      unchanged: [],
      failed_reason: reason,
    },
  ];
}

type PickerOptions = Parameters<typeof ClioModelPicker>[0]['options'];

/** Lets a test change the catalog the open picker shows (a later catalog read). */
let showOptions: (next: PickerOptions) => void = () => {};

function Harness({ provider }: { provider: string }) {
  const [current, setCurrent] = useState<PickerOptions>(options);
  useEffect(() => {
    showOptions = setCurrent;
  }, []);
  return (
    <ClioModelPicker
      model={undefined}
      onChange={vi.fn()}
      options={current}
      provider={provider}
      trigger={<Button>Change model</Button>}
    />
  );
}

async function openOn(provider: string) {
  const user = userEvent.setup();
  renderPicker(<Harness provider={provider} />);
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

describe('ClioModelPicker: a provider action belongs to the provider it ran for', () => {
  it('shows a failed reload under its own provider, in plain words', async () => {
    repository.refreshProviderModels.mockResolvedValueOnce(refreshFailure('local-vllm', VLLM_DOWN));
    const user = await openOn('local-vllm');

    await user.click(screen.getByRole('button', { name: 'Reload models' }));

    await waitFor(() =>
      expect(footerAlert()).toHaveTextContent("Local vLLM isn't running at 127.0.0.1:8000."),
    );
    expect(footerAlert()?.textContent).not.toMatch(/server_not_running|ConnectError/u);
  });

  it('never shows a reload that settles after the person moved to another provider', async () => {
    let finish: (value: unknown) => void = () => {};
    repository.refreshProviderModels.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openOn('local-vllm');

    await user.click(screen.getByRole('button', { name: 'Reload models' }));
    await waitFor(() => expect(stage()).toHaveTextContent('Finding models…'));
    await user.click(screen.getByText('Codex'));
    // The running reload's progress is not Codex's either.
    expect(stage()).toBeNull();

    finish(refreshFailure('local-vllm', VLLM_DOWN));
    await waitFor(() => expect(repository.refreshProviderModels).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(footerAlert()).toBeNull();
    expect(stage()).toBeNull();
  });

  it('never carries a failed action from one provider to the next', async () => {
    repository.refreshProviderModels.mockRejectedValueOnce(new Error('The service could not be reached.'));
    const user = await openOn('local-vllm');

    await user.click(screen.getByRole('button', { name: 'Reload models' }));
    await waitFor(() => expect(footerAlert()).toHaveTextContent('The service could not be reached.'));

    await user.click(screen.getByText('Codex'));

    await waitFor(() => expect(footerAlert()).toBeNull());
  });

  it('drops a failed reload once the provider has since reported healthy', async () => {
    repository.refreshProviderModels.mockResolvedValueOnce(
      refreshFailure('local-vllm', VLLM_DOWN, '2026-09-27T12:00:00Z'),
    );
    const user = await openOn('local-vllm');
    await user.click(screen.getByRole('button', { name: 'Reload models' }));
    await waitFor(() => expect(footerAlert()).not.toBeNull());

    // The server came up and a later catalog read reported it healthy.
    const recovered = options.map((option) =>
      option.providerId === 'local-vllm' ? { ...option, freshness: '2026-09-27T12:05:00Z' } : option,
    );
    act(() => showOptions(recovered));

    await waitFor(() => expect(footerAlert()).toBeNull());
  });
});
