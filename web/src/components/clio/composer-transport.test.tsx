import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import type { ClioModelOption } from '@/lib/model-options';
import { ClioComposer, type ClioComposerProps } from './composer';

const repositoryMocks = vi.hoisted(() => ({ workspaceReferences: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The picker itself is covered by its own tests; here it only hands the composer a row.
vi.mock('./model-picker', () => ({
  ClioModelPicker: ({
    onChange,
    options,
    transport,
    trigger,
  }: {
    onChange: (choice: ClioModelOption) => void;
    options: readonly ClioModelOption[];
    transport?: string;
    trigger: ReactNode;
  }) => (
    <div>
      {trigger}
      <output data-testid="picker-transport">{transport ?? ''}</output>
      {options.map((option) => (
        <button key={option.transport} onClick={() => onChange(option)} type="button">
          Pick {option.transport}
        </button>
      ))}
    </div>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  repositoryMocks.workspaceReferences.mockReset();
  repositoryMocks.workspaceReferences.mockResolvedValue([]);
});

/** Codex lists the same model once per transport. */
function half(transport: string): ClioModelOption {
  return {
    providerId: 'codex',
    providerName: 'Codex',
    id: 'gpt-5.5',
    label: 'gpt-5.5',
    available: true,
    transport,
    transports: [
      { id: 'sdk', label: 'Codex (local)', health: 'ready', reason: '' },
      { id: 'direct', label: 'Direct', health: 'ready', reason: '', auth: { method: 'oauth', logout: true } },
    ],
  };
}

function renderComposer(onSubmit: ClioComposerProps['onSubmit']) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          model="gpt-5.5"
          modelOptions={[half('sdk'), half('direct')]}
          onSubmit={onSubmit}
          provider="codex"
          state="completed"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
}

function editor(): HTMLElement {
  return screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
}

describe('ClioComposer transport selection', () => {
  it('sends the picked half of a multi-transport provider', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    renderComposer(onSubmit);

    await user.click(screen.getByRole('button', { name: 'Pick direct' }));
    await user.type(editor(), 'Go.{Enter}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.5',
      transport: 'direct',
    });
  });

  it('the model button and the picker both name the picked half', async () => {
    const user = userEvent.setup();
    renderComposer(vi.fn(async () => undefined));
    const button = () => screen.getByRole('button', { name: 'Change model' });

    await user.click(screen.getByRole('button', { name: 'Pick direct' }));
    expect(button()).toHaveTextContent('Codex · Direct / gpt-5.5');
    expect(screen.getByTestId('picker-transport')).toHaveTextContent('direct');

    await user.click(screen.getByRole('button', { name: 'Pick sdk' }));
    expect(button()).toHaveTextContent('Codex · SDK / gpt-5.5');
    expect(screen.getByTestId('picker-transport')).toHaveTextContent('sdk');
  });

  it('sends no transport when none was picked, so the configured one applies', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    renderComposer(onSubmit);

    await user.type(editor(), 'Go.{Enter}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].transport).toBeUndefined();
  });
});
