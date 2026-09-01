import type { CommandDefinition } from '@clio/core/v3';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer } from './composer';

afterEach(cleanup);

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
});

const commands: CommandDefinition[] = [
  {
    id: '/review',
    title: 'Review evidence',
    description: 'Review an artifact with the configured evidence agent.',
    source: 'clio-agent',
    status: 'ready',
    enabled: true,
    aliases: ['/rev'],
    user_invocable: true,
    agent_invocable: false,
    argument_hint: '<artifact path>',
    arguments: [],
    metadata: {},
  },
  {
    id: '/admin',
    title: 'Admin operation',
    source: 'clio-agent',
    status: 'disabled',
    enabled: false,
    disabled_reason: 'Requires administrator access.',
    aliases: [],
    arguments: [],
    metadata: {},
  },
];

function renderComposer({
  attachments = false,
  onCommand = vi.fn(async () => undefined),
  onStop = vi.fn(),
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
}: {
  attachments?: boolean;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onStop?: () => void;
  onSubmit?: (value: { text: string }) => Promise<void>;
  state?: 'completed' | 'running';
} = {}) {
  render(
    <PromptInputProvider>
      <ClioComposer
        attachments={attachments}
        commands={commands}
        effort="medium"
        model="gpt-5.6-luna"
        onCommand={onCommand}
        onStop={onStop}
        onSubmit={onSubmit}
        provider="codex"
        state={state}
      />
    </PromptInputProvider>,
  );
  return { onCommand, onStop, onSubmit };
}

describe('ClioComposer service commands', () => {
  it('adds and submits every file selected in one picker interaction', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ attachments: true, onSubmit });

    const files = [
      new File(['# First'], 'first.md', { type: 'text/markdown' }),
      new File(['print("second")'], 'second.py', { type: 'text/x-python' }),
    ];
    const picker = screen.getByLabelText('Upload files');

    expect(picker).toHaveAttribute('multiple');
    await user.upload(picker, files);

    expect(screen.getByRole('button', { name: 'Open first.md' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open second.py' })).toBeVisible();

    await user.type(screen.getByRole('textbox'), 'Inspect both files.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [
            expect.objectContaining({ filename: 'first.md', mediaType: 'text/markdown' }),
            expect.objectContaining({ filename: 'second.py', mediaType: 'text/x-python' }),
          ],
          text: 'Inspect both files.',
        }),
      ),
    );
  });

  it('opens the AI Elements attachment picker from a direct composer action', async () => {
    const user = userEvent.setup();
    renderComposer({ attachments: true });
    const picker = screen.getByLabelText('Upload files');
    const open = vi.spyOn(picker, 'click');

    await user.click(screen.getByRole('button', { name: 'Add files' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('renders an image thumbnail and opens the full attachment preview', async () => {
    const user = userEvent.setup();
    renderComposer({ attachments: true });
    const picker = screen.getByLabelText('Upload files');
    const image = new File(['pixels'], 'field-map.png', { type: 'image/png' });

    await user.upload(picker, image);

    const thumbnail = screen.getByRole('img', { name: 'field-map.png' });
    expect(thumbnail).toBeVisible();
    expect(thumbnail).toHaveAttribute('src', 'blob:test-field-map.png');

    await user.click(screen.getByRole('button', { name: 'Open field-map.png' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByRole('heading', { name: 'field-map.png' })).toBeVisible();
    expect(within(dialog).getByRole('img', { name: 'field-map.png' })).toHaveAttribute(
      'src',
      'blob:test-field-map.png',
    );
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
    const { rerender } = render(<ClioComposer {...props} focusRequestKey={0} />);
    const input = screen.getByRole('textbox');

    expect(input).not.toHaveFocus();

    rerender(<ClioComposer {...props} focusRequestKey={1} />);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('discovers sourced commands and dispatches the canonical command with arguments', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/rev');
    await user.click(screen.getByText('Review evidence'));
    expect(input).toHaveValue('/review ');

    await user.type(input, 'results/stations.csv{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      commandId: '/review',
      input: 'results/stations.csv',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('does not turn unknown slash commands into chat messages', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/not-a-service-command{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('/not-a-service-command');
  });

  it('explains unavailable service commands without dispatching them', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/admin');
    expect(screen.getByText('Requires administrator access.')).toBeVisible();
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(input).toHaveValue('/admin');
  });

  it('keeps steering and stopping as distinct actions while work is running', async () => {
    const user = userEvent.setup();
    const { onStop, onSubmit } = renderComposer({ state: 'running' });
    const input = screen.getByRole('textbox');

    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Steer current work' })).toBeDisabled();

    await user.type(input, 'Prioritize the provenance gap.');
    await user.click(screen.getByRole('button', { name: 'Steer current work' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Prioritize the provenance gap.' }),
    );
    expect(onStop).not.toHaveBeenCalled();
  });

  it('queues Enter and steers Ctrl+Enter while work is running', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ state: 'running' });
    const input = screen.getByRole('textbox');

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
  });

  it('starts normally from either Enter shortcut while idle', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

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

  it('resets a queued running-turn intent when the session becomes idle', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    const renderState = (state: 'completed' | 'running') => (
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          effort="medium"
          model="gpt-5.6-luna"
          onSubmit={onSubmit}
          provider="codex"
          state={state}
        />
      </PromptInputProvider>
    );
    const view = render(renderState('running'));
    const input = screen.getByRole('textbox');

    await user.type(input, 'Queue this while running.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'queued', text: 'Queue this while running.' }),
      ),
    );

    view.rerender(renderState('completed'));
    await user.type(screen.getByRole('textbox'), 'Start this after completion.');
    await user.click(screen.getByRole('button', { name: /^Submit$/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start this after completion.' }),
      ),
    );
  });
});
