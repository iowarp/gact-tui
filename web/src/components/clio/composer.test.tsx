import type { CommandDefinition } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposer } from './composer';

afterEach(cleanup);

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
  onCommand = vi.fn(async () => undefined),
  onStop = vi.fn(),
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
}: {
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onStop?: () => void;
  onSubmit?: (value: { text: string }) => Promise<void>;
  state?: 'completed' | 'running';
} = {}) {
  render(
    <ClioComposer
      attachments={false}
      commands={commands}
      effort="medium"
      model="gpt-5.6-luna"
      onCommand={onCommand}
      onStop={onStop}
      onSubmit={onSubmit}
      provider="codex"
      state={state}
    />,
  );
  return { onCommand, onStop, onSubmit };
}

describe('ClioComposer service commands', () => {
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
});
