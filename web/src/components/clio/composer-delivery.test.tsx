import type { RunState } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { LiveConnection } from '@/test/live-connection';
import { ClioComposer, type ClioComposerProps } from './composer';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ workspaceReferences: async () => [] }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
afterEach(cleanup);

function show(state: RunState) {
  const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveConnection>
        <PromptInputProvider>
          <ClioComposer
            attachments={false}
            contextReferences={false}
            state={state}
            model="test"
            provider="test"
            onSubmit={onSubmit}
          />
        </PromptInputProvider>
      </LiveConnection>
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('Composer delivery keys and visible action', () => {
  it.each([
    ['running', false, 'queued'],
    ['running', true, 'steer'],
    ['waiting_user', false, 'start'],
    ['waiting_user', true, 'start'],
    ['interrupted', false, 'start'],
    ['interrupted', true, 'start'],
    ['completed', false, 'start'],
    ['completed', true, 'start'],
  ] as const)('%s with modifier=%s delivers %s', async (state, modifier, delivery) => {
    const user = userEvent.setup();
    const submit = show(state);
    const editor = screen.getByRole('combobox', { name: /^Ask /u });
    await user.type(editor, 'Keep this request');
    if (modifier) await user.keyboard('{Control>}');
    expect(
      screen.getByRole('button', {
        name: delivery === 'queued' ? 'Queue' : delivery === 'steer' ? 'Steer' : 'Send',
      }),
    ).toBeEnabled();
    await user.keyboard('{Enter}');
    if (modifier) await user.keyboard('{/Control}');
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ delivery, text: 'Keep this request' });
  });

  it('updates the button on modifier release and clears a held modifier when the window loses focus', async () => {
    const user = userEvent.setup();
    const submit = show('running');
    await user.type(screen.getByRole('combobox', { name: /^Ask /u }), 'Queued request');
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Steer' })).toBeVisible();
    fireEvent.keyUp(window, { key: 'Control', ctrlKey: false });
    expect(screen.getByRole('button', { name: 'Queue' })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    expect(screen.getByRole('button', { name: 'Steer' })).toBeVisible();
    fireEvent.blur(window);
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ delivery: 'queued' });
  });
});
