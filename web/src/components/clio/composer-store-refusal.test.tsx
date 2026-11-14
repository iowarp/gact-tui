import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { LiveConnection } from '@/test/live-connection';
import { ClioComposer, type ClioComposerProps } from './composer';
import { composerFailureReason, storeRefusal } from './composer-failure';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ workspaceReferences: async () => [] }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
afterEach(cleanup);

const FULL =
  "Not saved: CLIO's conversation store is full, so nothing new can be recorded. Free disk space or give the store more room, then restart CLIO.";
const refusal = () => new TransportError(FULL, 503, 'clio_core_writes_refused', {});

function show(onSubmit: ClioComposerProps['onSubmit']) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LiveConnection>
        <PromptInputProvider>
          <ClioComposer
            attachments={false}
            contextReferences={false}
            state="running"
            model="test"
            provider="test"
            onSubmit={onSubmit}
          />
        </PromptInputProvider>
      </LiveConnection>
    </QueryClientProvider>,
  );
}

describe('a message the conversation store refused (MC-F3)', () => {
  it('reads the typed refusal as the service wrote it, and nothing else as one', () => {
    expect(storeRefusal(refusal())).toBe(FULL);
    expect(composerFailureReason(refusal(), 'fallback')).toBe(FULL);
    const recovering = new TransportError('Recovering.', 503, 'core_recording_unconfirmed');
    expect(storeRefusal(recovering)).toBeUndefined();
    expect(composerFailureReason(recovering, 'fallback')).toBe("The service hit an error.");
    expect(storeRefusal(new Error(FULL))).toBeUndefined();
  });

  it('stays under the composer with the message kept until a send is accepted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<ClioComposerProps['onSubmit']>()
      .mockRejectedValueOnce(refusal())
      .mockResolvedValueOnce(undefined);
    show(onSubmit);
    const editor = screen.getByRole('combobox', { name: /^Ask /u });
    await user.type(editor, 'Are you still there?{Enter}');
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveAttribute('data-slot', 'store-refusal');
    expect(notice).toHaveTextContent(`Your message was not saved. ${FULL}`);
    expect(editor).toHaveTextContent('Are you still there?');

    await user.type(editor, '{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
