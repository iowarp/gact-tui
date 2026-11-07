import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer, type ClioComposerProps } from './composer';
import { parseSpotterModelRef, spotterModelRef } from '@/lib/spotter-model-ref';

const repository = vi.hoisted(() => ({
  workspaceReferences: vi.fn(async () => []),
  spotterAvailability: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('./model-picker', () => ({
  ClioModelPicker: ({
    title = 'Choose a model',
    onChange,
    trigger,
  }: {
    title?: string;
    onChange: (choice: { providerId: string; id: string }) => void;
    trigger: React.ReactNode;
  }) => (
    <>
      {trigger}
      <button
        onClick={() => onChange({ providerId: 'server-vllm-spotter', id: 'qwen3' })}
        type="button"
      >
        {title}
      </button>
    </>
  ),
}));

const modelOptions: ClioComposerProps['modelOptions'] = [
  {
    available: true,
    id: 'qwen3',
    label: 'Qwen3',
    providerId: 'server-vllm-spotter',
    providerName: 'Spotter vLLM',
  },
];

beforeEach(() => {
  repository.spotterAvailability.mockResolvedValue({
    available: true,
    reason: '',
    message: '',
    remedy: '',
    verified: 'runtime',
  });
  vi.mocked(toast.error).mockClear();
});
afterEach(cleanup);

function renderComposer(props: Partial<ClioComposerProps> = {}) {
  const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          confirmationPolicy="spotter-ai"
          contextReferences={false}
          model="qwen3"
          modelOptions={modelOptions}
          onSubmit={onSubmit}
          provider="server-vllm-spotter"
          state="completed"
          workspaceId="ws_1"
          {...props}
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('SPOTTER model references', () => {
  it('round-trips a fleet reference and rejects one without an account or model', () => {
    expect(spotterModelRef({ providerId: 'server-vllm-spotter', id: 'org/qwen3' })).toBe(
      'server-vllm-spotter/org/qwen3',
    );
    expect(parseSpotterModelRef('server-vllm-spotter/org/qwen3')).toEqual({
      providerId: 'server-vllm-spotter',
      modelId: 'org/qwen3',
    });
    expect(parseSpotterModelRef('')).toBeUndefined();
    expect(parseSpotterModelRef('qwen3')).toBeUndefined();
    expect(parseSpotterModelRef('/qwen3')).toBeUndefined();
    expect(parseSpotterModelRef('server/')).toBeUndefined();
  });
});

describe('Composer SPOTTER model', () => {
  it('stores the chosen model on the open session and clears it back to the conversation model', async () => {
    const user = userEvent.setup();
    const onSpotterModelChange = vi.fn(async () => undefined);
    renderComposer({ onSpotterModelChange });

    expect(
      await screen.findByRole('button', { name: 'SPOTTER model: Conversation model' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Use conversation model for SPOTTER' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Choose SPOTTER model' }));
    expect(onSpotterModelChange).toHaveBeenCalledWith('server-vllm-spotter/qwen3');
    expect(
      screen.getByRole('button', { name: 'SPOTTER model: Spotter vLLM / Qwen3' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Use conversation model for SPOTTER' }));
    expect(onSpotterModelChange).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('button', { name: 'SPOTTER model: Conversation model' })).toBeVisible();
  });

  it('names a stored reference the catalog does not list', async () => {
    renderComposer({ spotterModel: 'server-other/mystery' });
    expect(
      await screen.findByRole('button', { name: 'SPOTTER model: server-other/mystery' }),
    ).toBeVisible();
  });

  it('restores the previous choice and reports the service refusal', async () => {
    const user = userEvent.setup();
    const onSpotterModelChange = vi.fn(async () => {
      throw new Error('Unknown fleet model server-vllm-spotter/qwen3.');
    });
    renderComposer({ onSpotterModelChange });

    await user.click(await screen.findByRole('button', { name: 'Choose SPOTTER model' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('SPOTTER model was not changed', {
        description: 'Unknown fleet model server-vllm-spotter/qwen3.',
      }),
    );
    expect(screen.getByRole('button', { name: 'SPOTTER model: Conversation model' })).toBeVisible();
  });

  it('is hidden under another confirmation policy', async () => {
    renderComposer({ confirmationPolicy: 'ask' });
    await waitFor(() => expect(repository.spotterAvailability).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^SPOTTER model:/ })).toBeNull();
  });

  it('sends a new conversation’s choice with its first message', async () => {
    const user = userEvent.setup();
    const onSubmit = renderComposer({ variant: 'welcome' });

    await user.click(await screen.findByRole('button', { name: 'Choose SPOTTER model' }));
    await user.type(
      screen.getByRole('combobox', { name: /investigate, build, explain, or act/u }),
      'Watch this run',
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      spotterModel: 'server-vllm-spotter/qwen3',
      behavior: expect.objectContaining({ confirmation_policy: 'spotter-ai' }),
    });
  });
});
