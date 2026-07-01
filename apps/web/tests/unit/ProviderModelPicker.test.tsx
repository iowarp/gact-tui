import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderModelPicker } from '../../src/components/ProviderModelPicker.js';
import type { ModelProviderOption } from '../../src/components/ComposerTypes.js';

afterEach(cleanup);

const providers: ModelProviderOption[] = [
  {
    id: 'lm_studio',
    label: 'LM Studio',
    status: 'setup',
    statusLabel: 'setup',
    disabled: true,
    models: [],
  },
  {
    id: 'claude_code',
    label: 'Claude Code (subscription)',
    shortLabel: 'Claude Code',
    status: 'ok',
    statusLabel: 'ok',
    models: [
      {
        id: 'claude_code:haiku',
        providerId: 'claude_code',
        providerLabel: 'Claude Code',
        modelId: 'haiku',
      },
      {
        id: 'claude_code:sonnet',
        providerId: 'claude_code',
        providerLabel: 'Claude Code',
        modelId: 'sonnet',
      },
    ],
  },
];

describe('ProviderModelPicker', () => {
  it('opens on the selected provider and lists its models', () => {
    const onPickModel = vi.fn();
    render(() => (
      <ProviderModelPicker
        providers={providers}
        fallbackItems={[]}
        selectedModelId="claude_code:haiku"
        selectedModelLabel="haiku"
        onPickModel={onPickModel}
      />
    ));

    expect(screen.getByTestId('composer-model-trigger').textContent).toContain(
      'Claude Code / haiku',
    );
    expect(screen.getByTestId('composer-model-trigger').textContent).not.toContain(
      'subscription',
    );

    fireEvent.click(screen.getByTestId('composer-model-trigger'));

    expect(screen.getByTestId('composer-model-menu').textContent).toContain('Claude Code');
    expect(screen.getByTestId('composer-model-menu').textContent).not.toContain('subscription');
    expect(screen.getByTestId('composer-model-menu').textContent).toContain('haiku');
    expect(screen.getByTestId('composer-model-menu').textContent).toContain('sonnet');

    fireEvent.click(screen.getByTestId('composer-model-item-claude_code:sonnet'));
    expect(onPickModel).toHaveBeenCalledWith(providers[1]!.models[1]);
  });
});
