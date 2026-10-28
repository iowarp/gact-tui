import { agentResolutionSchema } from '@clio/core/v3';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
// Unit assertions cover the reader itself; chunk loading is checked in the browser.
import './file-text-view';
import { ComposedPromptView } from './composed-prompt-view';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function resolution(text?: string) {
  return agentResolutionSchema.parse({
    agent: { ref: 'clio/researcher', id: 'researcher', name: 'Researcher' },
    prompt: {
      text,
      sections: [
        {
          section: 'identity',
          fragments: [
            { id: 'first', plugin: 'agent:researcher', text: '# Identity\nFirst fragment.' },
          ],
        },
        {
          section: 'capabilities',
          fragments: [{ id: 'second', plugin: 'core', text: '# Capabilities\nSecond fragment.' }],
        },
      ],
    },
  });
}

it('opens the complete server-rendered prompt independently of fragment filtering and preserves the inspector on close', async () => {
  const user = userEvent.setup();
  render(
    <ComposedPromptView
      resolution={resolution('# Rendered system prompt\n\nServer-only assembled text.\n')}
    />,
  );
  const search = screen.getByRole('searchbox', { name: 'Search the prompt' });
  await user.type(search, 'not-present');
  expect(await screen.findByText('No fragment mentions “not-present”.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'See all' }));
  const dialog = screen.getByRole('dialog', { name: 'Researcher system prompt' });
  expect(
    await within(dialog).findByRole('heading', { name: 'Rendered system prompt' }),
  ).toBeVisible();
  expect(within(dialog).getByText('Server-only assembled text.')).toBeVisible();
  expect(within(dialog).queryByText('First fragment.')).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(search).toHaveValue('not-present');
  expect(screen.getByRole('button', { name: 'See all' })).toHaveFocus();
});

it('uses the shared readable/source modes and copies the active representation', async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText');
  const text = '# Rendered prompt\n\n**Keep** the exact source.\n';
  render(<ComposedPromptView resolution={resolution(text)} />);
  await user.click(screen.getByRole('button', { name: 'See all' }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByRole('heading', { name: 'Rendered prompt' });
  await user.click(within(dialog).getByRole('button', { name: 'Copy Researcher system prompt' }));
  await waitFor(() => expect(write).toHaveBeenCalled());
  expect(write.mock.calls[0][0]).toContain('Keep the exact source.');
  expect(write.mock.calls[0][0]).not.toContain('**Keep**');
  await user.click(within(dialog).getByRole('tab', { name: 'Source' }));
  await user.click(within(dialog).getByRole('button', { name: 'Copy Researcher system prompt' }));
  await waitFor(() => expect(write).toHaveBeenLastCalledWith(text));
});

it('supports older responses by joining every unfiltered fragment in composition order', async () => {
  const user = userEvent.setup();
  render(<ComposedPromptView resolution={resolution()} />);
  await user.type(screen.getByRole('searchbox', { name: 'Search the prompt' }), 'second');
  await user.click(screen.getByRole('button', { name: 'See all' }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByRole('heading', { name: 'Identity' });
  expect(within(dialog).getByRole('heading', { name: 'Capabilities' })).toBeVisible();
  expect(dialog.textContent!.indexOf('First fragment.')).toBeLessThan(
    dialog.textContent!.indexOf('Second fragment.'),
  );
});

it('respects an explicitly empty assembled prompt instead of inventing one from fragments', () => {
  render(<ComposedPromptView resolution={resolution('')} />);
  expect(screen.getByRole('button', { name: 'See all' })).toBeDisabled();
});
