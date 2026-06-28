import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, ProviderDef } from '@clio/core';
import { ProviderCard } from '../../src/routes/discovery/ProviderCard.js';

afterEach(cleanup);

const PROVIDER: ProviderDef = {
  id: 'argonne',
  name: 'Argonne Sophia',
  description: 'ALCF-hosted OpenAI-compatible endpoint',
  default_model: 'openai/gpt-oss-120b',
  api_base: 'https://sophia/v1',
  auth_methods: ['oauth'],
  is_authenticated: true,
};

function makeClient() {
  const providerModels = vi.fn().mockResolvedValue({
    models: [
      {
        id: 'openai/gpt-oss-120b',
        label: 'GPT OSS 120B',
        source: 'discovered',
        context_length: 131_000,
      },
    ],
  });
  const getProvider = vi.fn().mockResolvedValue({
    id: 'argonne',
    vendor: 'ALCF',
    status: 'ready',
    auth: { kind: 'oauth', required: true },
  });
  return {
    client: { providerModels, getProvider } as unknown as Client,
    providerModels,
    getProvider,
  };
}

describe('ProviderCard', () => {
  it('lazy-loads models once and keeps them cached across collapse', async () => {
    const { client, providerModels, getProvider } = makeClient();
    render(() => (
      <ProviderCard
        p={PROVIDER}
        isActive={false}
        busy={false}
        client={client}
        onUse={() => undefined}
        onAuth={() => undefined}
      />
    ));

    expect(providerModels).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('provider-models-toggle-argonne'));

    await waitFor(() => expect(providerModels).toHaveBeenCalledWith('argonne'));
    expect(getProvider).toHaveBeenCalledWith('argonne');
    await waitFor(() =>
      expect(screen.getByTestId('provider-model-openai/gpt-oss-120b').textContent).toContain(
        'GPT OSS 120B',
      ),
    );

    fireEvent.click(screen.getByTestId('provider-models-toggle-argonne'));
    fireEvent.click(screen.getByTestId('provider-models-toggle-argonne'));

    await waitFor(() => expect(screen.getByTestId('provider-detail-argonne')).toBeTruthy());
    expect(providerModels).toHaveBeenCalledTimes(1);
    expect(getProvider).toHaveBeenCalledTimes(1);
  });
});
