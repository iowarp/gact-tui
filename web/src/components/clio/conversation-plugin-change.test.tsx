import type { Message, MessageBlock } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { HarnessInjection } from './conversation-harness-injection';
import { conversationTurnPresentation } from './conversation-turn-model';
import { pluginChangeLabel, pluginNameResolver } from '@/lib/plugin-presentation';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

// Exactly what clio sends (prompt_basis.plugin_change_note).
const NOTE = [
  "The person changed this conversation's plugins.",
  'Removed: document-runtime, pdf. Do not use their tools or follow their instructions, even though they still appear above.',
  'Added: shell.',
  'Prefer gh.',
  'Your system prompt will include these changes after the next compaction.',
].join('\n');

function block(text: string): InjectionBlock {
  return { id: 'inj_1', type: 'injection', source: 'plugin_change', text } as InjectionBlock;
}

afterEach(cleanup);

describe('plugin_change injection', () => {
  it('names connector plugins after their connector (FP-D5)', () => {
    const nameOf = pluginNameResolver(
      [
        { id: 'viewer', follows: 'viewer' },
        { id: 'tools', follows: '' },
      ],
      [
        { id: 'viewer', name: 'Viewer Pro', plugin: 'viewer' },
        { id: 'molecules', name: 'Molecule Lab', plugin: '' },
      ],
    );
    const note = 'Added: connector-molecules.\nAdded: viewer.\nAdded: tools.';
    expect(pluginChangeLabel(note, nameOf)).toBe(
      'Plugins changed: +Molecule Lab, +Viewer Pro, +Tools',
    );
  });

  it('labels the change from the note itself', () => {
    expect(pluginChangeLabel(NOTE)).toBe('Plugins changed: +Shell, −Document runtime, −Pdf');
    expect(pluginChangeLabel('Something else entirely.')).toBe('Plugins changed');
  });

  it('names the tools a change made callable now', async () => {
    const withTools = [
      NOTE,
      'New tools you can call now, though they are not in your tool list until the next compaction:',
      '- shell_bash(command: string): Run one local shell command per call.',
      '- shell_which(name: string): Find an executable.',
    ].join('\n');
    expect(pluginChangeLabel(withTools)).toBe(
      'Plugins changed: +Shell, −Document runtime, −Pdf (2 new tools)',
    );
    const user = userEvent.setup();
    render(<HarnessInjection block={block(withTools)} />);
    await user.hover(screen.getByRole('button', { name: /2 new tools/ }));
    expect(await screen.findByText('shell_bash, shell_which')).toBeInTheDocument();
  });

  it('renders as a chip whose hover shows what the agent got', async () => {
    const user = userEvent.setup();
    render(<HarnessInjection block={block(NOTE)} />);
    const chip = screen.getByRole('button', {
      name: 'Plugins changed: +Shell, −Document runtime, −Pdf',
    });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    await user.hover(chip);
    const details = await screen.findByText(
      'Sent to the agent as an instruction. Its system prompt updates at the next compaction.',
    );
    expect(details.parentElement).toHaveTextContent(
      'Removed: document-runtime, pdf. Do not use their tools',
    );
    expect(details.parentElement).toHaveTextContent('Prefer gh.');
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(chip).toHaveAccessibleDescription(/Sent to the agent as an instruction/u);
  });

  it('opens on keyboard focus too', async () => {
    const user = userEvent.setup();
    render(<HarnessInjection block={block('Added: shell.')} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Plugins changed: +Shell' })).toHaveFocus();
    await waitFor(() =>
      expect(
        screen.getByText(
          'Sent to the agent as an instruction. Its system prompt updates at the next compaction.',
        ),
      ).toBeVisible(),
    );
  });

  it('stays at its step in the turn instead of folding into the activity', () => {
    const message: Message = {
      id: 'msg_1',
      session_id: 'session_1',
      role: 'assistant',
      created_at: '2026-10-21T00:00:00Z',
      blocks: [block(NOTE), { id: 'text_1', type: 'text', text: 'Hi' }],
    };
    const view = conversationTurnPresentation(message, {});
    expect(view.segments[0]).toEqual({ kind: 'block', block: block(NOTE) });
    expect(view.iterations.flatMap((item) => item.activity)).toEqual([]);
  });
});
