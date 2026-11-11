import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import {
  composerEditor,
  installMatchMedia,
  renderComposer,
  withTestQueryClient,
} from '@/test/composer-harness';
import { ClioComposer, type ClioComposerProps } from './composer';

// Split from composer.test.tsx (the 800-line CLIO-owned file-size ratchet).
// This file owns slash commands, focus and running/queued/steer state;
// composer-service-attachments.test.tsx owns attachments. Both share
// @/test/composer-harness.

const repositoryMocks = vi.hoisted(() => ({
  workspaceReferences: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

beforeEach(() => {
  repositoryMocks.workspaceReferences.mockReset();
  repositoryMocks.workspaceReferences.mockResolvedValue([]);
  vi.mocked(toast.error).mockClear();
  installMatchMedia();
});

describe('ClioComposer service commands', () => {
  it('pastes rich clipboard content as plain text', async () => {
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();
    await user.click(editor);

    fireEvent.paste(editor, {
      clipboardData: {
        files: [],
        getData: (type: string) => (type === 'text/plain' ? 'plain text' : '<b>plain text</b>'),
        items: [],
      },
    });

    expect(document.querySelector('input[name="message"]')).toHaveValue('plain text');
    expect(editor.querySelector('b')).toBeNull();
  });

  it('keeps the selectors the desktop WebView probe drives the composer with', async () => {
    const user = userEvent.setup();
    renderComposer();

    // desktop/tests/webview-e2e.test.mjs cannot run in this suite — it needs a
    // built Tauri app and a native WebDriver — so its two selectors are held
    // against the real component here instead of drifting silently.
    const probed = document.querySelector(
      'div[contenteditable="true"][role="combobox"], div[contenteditable="true"][role="textbox"]',
    );
    expect(probed).toBe(composerEditor());

    await user.type(composerEditor(), 'Run this shell command');
    const mirror = document.querySelector('input[name="message"]');
    expect(mirror).toHaveValue('Run this shell command');
  });

  it('brings the placeholder back when the draft is cleared by hand', async () => {
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    await user.type(editor, 'Half a thought');
    expect(editor).not.toBeEmptyDOMElement();

    // Clearing a contenteditable by hand leaves a stray <br> behind, which
    // defeats the :empty rule the placeholder is drawn with.
    editor.innerHTML = '<br>';
    fireEvent.input(editor);

    expect(editor).toBeEmptyDOMElement();
    expect(editor).toHaveAttribute('data-placeholder', 'Reply');
    expect(document.querySelector('input[name="message"]')).toHaveValue('');
  });

  it('focuses only after an explicit focus request changes', async () => {
    const props = {
      attachments: false,
      effort: 'medium',
      model: 'gpt-5.6-luna',
      onSubmit: vi.fn(async () => undefined),
      provider: 'codex',
      state: 'completed' as const,
    };
    const { rerender } = render(
      withTestQueryClient(<ClioComposer {...props} focusRequestKey={0} />),
    );
    const input = composerEditor();

    expect(input).not.toHaveFocus();

    rerender(withTestQueryClient(<ClioComposer {...props} focusRequestKey={1} />));
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('restores the composer focus after the sending block clears', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const props = {
      attachments: false,
      effort: 'medium',
      model: 'gpt-5.6-luna',
      onSubmit,
      provider: 'codex',
      state: 'completed' as const,
    };
    const view = render(withTestQueryClient(<ClioComposer {...props} />));
    const input = composerEditor();

    await user.type(input, 'Send this message.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    input.blur();
    view.rerender(withTestQueryClient(<ClioComposer {...props} disabled />));
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toHaveFocus();

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
    view.rerender(withTestQueryClient(<ClioComposer {...props} disabled={false} />));

    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveTextContent('');
  });

  it('discovers sourced commands and dispatches the canonical command with arguments', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = composerEditor();

    await user.type(input, '/rev');
    await user.click(screen.getByText('Review evidence'));
    expect(document.querySelector('input[name="message"]')).toHaveValue('/review ');

    await user.type(input, 'results/stations.csv{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      commandId: '/review',
      input: 'results/stations.csv',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('');
  });

  it('does not turn unknown slash commands into chat messages', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = composerEditor();

    await user.type(input, '/not-a-service-command{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('/not-a-service-command');
  });

  it('reports a rejected service command instead of swallowing it', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockRejectedValue(new Error('The command service is unreachable.'));
    renderComposer({ onCommand });
    const input = composerEditor();

    await user.type(input, '/review results/stations.csv{Enter}');

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Review evidence was not run', {
        description: 'The command service is unreachable.',
      }),
    );
    // A rejected command leaves the typed command in place to retry.
    expect(input).toHaveTextContent('/review results/stations.csv');
  });

  it('explains unavailable service commands without dispatching them', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderComposer();
    const input = composerEditor();

    await user.type(input, '/admin');
    expect(screen.getByText('Requires administrator access.')).toBeVisible();
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('/admin');
  });

  it('keeps steering and stopping as distinct actions while work is running', async () => {
    const user = userEvent.setup();
    const { onStop, onSubmit } = renderComposer({ state: 'running' });
    const input = composerEditor();

    expect(input).toBeEnabled();
    // Nothing typed: the one square stops the run.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Queue' })).not.toBeInTheDocument();
    expect(screen.queryByText('Working')).not.toBeInTheDocument();

    await user.type(input, 'Prioritize the provenance gap.');
    // Text: the same square queues it, and steers while Ctrl is held.
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queue' })).toBeEnabled();
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Steer' }));
    await user.keyboard('{/Control}');

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Prioritize the provenance gap.' }),
    );
    expect(onStop).not.toHaveBeenCalled();
  });

  it('stops from the send square when nothing is typed, and Enter sends nothing', async () => {
    const user = userEvent.setup();
    const { onStop, onSubmit } = renderComposer({ state: 'running' });
    const input = composerEditor();

    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(input, 'x');
    await user.keyboard('{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('queues Enter and steers Ctrl+Enter and Cmd+Enter into the running turn', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ state: 'running' });
    const input = composerEditor();

    await user.type(input, 'Review the second station.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          delivery: 'queued',
          text: 'Review the second station.',
        }),
      ),
    );

    await user.type(input, 'Stop using the stale catalog.{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          delivery: 'steer',
          text: 'Stop using the stale catalog.',
        }),
      ),
    );

    await user.type(input, 'Use the updated source.{Meta>}{Enter}{/Meta}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'steer', text: 'Use the updated source.' }),
      ),
    );
  });

  it('starts normally from either Enter shortcut while idle', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const input = composerEditor();

    await user.type(input, 'Start the analysis.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start the analysis.' }),
      ),
    );

    await user.type(input, 'Start another turn.{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start another turn.' }),
      ),
    );
  });

  it('resets a live-feedback intent when the session becomes idle', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    const renderState = (state: 'completed' | 'running') =>
      withTestQueryClient(
        <PromptInputProvider>
          <ClioComposer
            attachments={false}
            effort="medium"
            model="gpt-5.6-luna"
            onSubmit={onSubmit}
            provider="codex"
            state={state}
          />
        </PromptInputProvider>,
      );
    const view = render(renderState('running'));
    const input = composerEditor();

    await user.type(input, 'Use this feedback while running.{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'steer', text: 'Use this feedback while running.' }),
      ),
    );

    view.rerender(renderState('completed'));
    await user.type(composerEditor(), 'Start this after completion.');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start this after completion.' }),
      ),
    );
  });
});
