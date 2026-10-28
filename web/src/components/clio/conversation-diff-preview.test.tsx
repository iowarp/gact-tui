import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageBlockSequence } from './conversation-message-blocks';
import { ToolResultPresentation } from './tool-result-presentation';
import { copyText } from '@/lib/clipboard';

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function geometry(lines: number) {
  Range.prototype.getClientRects = vi.fn(
    () =>
      Array.from({ length: lines }, (_, i) => ({
        top: i * 24,
        bottom: (i + 1) * 24,
        width: 100,
        height: 24,
      })) as unknown as DOMRectList,
  );
}

it('bounds a standalone transcript diff, keeps full copying, and opens all changes with the keyboard', async () => {
  geometry(45);
  const user = userEvent.setup();
  const diff =
    '@@ -0,0 +1,42 @@\n' + Array.from({ length: 42 }, (_, i) => `+line ${i + 1}`).join('\n');
  const open = vi.fn();
  const { container } = render(
    <MessageBlockSequence
      blocks={[{ id: 'change', type: 'diff', path: 'agenda.md', unified_diff: diff }]}
      tools={{}}
      tasks={{}}
      subagents={{}}
      artifacts={{}}
      surfaces={{}}
      onOpenFile={open}
    />,
  );
  expect(container.querySelector('[id]')).toHaveStyle({ maxHeight: '120px' });
  await user.click(screen.getByRole('button', { name: 'Copy diff for agenda.md' }));
  expect(copyText).toHaveBeenCalledWith(diff);
  await user.click(screen.getByRole('button', { name: 'Open agenda.md in workspace' }));
  expect(open).toHaveBeenCalledWith('agenda.md');
  const more = screen.getByRole('button', { name: 'Show more' });
  more.focus();
  await user.keyboard('{Enter}');
  const dialog = screen.getByRole('dialog', { name: 'File changes' });
  expect(within(dialog).getByText('+line 42')).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(more).toHaveFocus();
});

it.each([false, true])(
  'uses the same five-line budget for tool diffs (file subject: %s)',
  (fileSubject) => {
    geometry(12);
    const { container } = render(
      <ToolResultPresentation
        subjectId={fileSubject ? 'file' : undefined}
        tool={{
          id: 'edit',
          session_id: 's',
          name: 'fs_write_file',
          state: 'succeeded',
          presentation: {
            action: 'Write',
          summary: '',
            blocks: [
              ...(fileSubject
                ? [
                    {
                      id: 'file',
                      type: 'link' as const,
                      target: 'file' as const,
                      label: 'agenda.md',
                    },
                  ]
                : []),
              { id: 'changes', type: 'diff', text: '@@ -1 +1 @@\n-old\n+new' },
            ],
          },
        }}
      />,
    );
    expect(container.querySelector('[id]')).toHaveStyle({ maxHeight: '120px' });
    expect(screen.getByRole('button', { name: 'Show more' })).toBeVisible();
  },
);

it('keeps a short standalone diff readable without an empty disclosure', () => {
  geometry(3);
  render(
    <MessageBlockSequence
      blocks={[
        { id: 'change', type: 'diff', path: 'agenda.md', unified_diff: '@@ -1 +1 @@\n-old\n+new' },
      ]}
      tools={{}}
      tasks={{}}
      subagents={{}}
      artifacts={{}}
      surfaces={{}}
    />,
  );
  expect(screen.getByText('+new')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
});
