import { cleanup, screen, within } from '@testing-library/react';
import { renderWithTooltips } from '@/test/render-with-tooltips';
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

it('shows a standalone transcript diff as numbered changes, keeps full copying, and opens the file', async () => {
  const user = userEvent.setup();
  const diff =
    '--- a/agenda.md\n+++ b/agenda.md\n@@ -0,0 +1,42 @@\n' +
    Array.from({ length: 42 }, (_, i) => `+line ${i + 1}`).join('\n');
  const open = vi.fn();
  renderWithTooltips(
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
  // The header names the file once with its counts; the lines start at the change, and Copy
  // still copies the whole diff.
  expect(screen.getByText('42 lines added, 0 removed')).toBeInTheDocument();
  expect(screen.queryByText('+++ b/agenda.md')).toBeNull();
  const rows = within(screen.getByRole('table', { name: 'Changes' })).getAllByRole('row');
  expect(rows).toHaveLength(42);
  expect(rows.at(-1)).toHaveTextContent('42Added: line 42');
  await user.click(screen.getByRole('button', { name: 'Copy diff' }));
  expect(copyText).toHaveBeenCalledWith(diff);
  await user.click(screen.getByRole('button', { name: 'Open agenda.md' }));
  expect(open).toHaveBeenCalledWith('agenda.md');
});

it.each([false, true])(
  'uses the same five-line budget for tool diffs (file subject: %s)',
  (fileSubject) => {
    geometry(12);
    const { container } = renderWithTooltips(
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
  renderWithTooltips(
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
  const rows = within(screen.getByRole('table', { name: 'Changes' })).getAllByRole('row');
  expect(rows.map((row) => row.textContent)).toEqual(['1Removed: old', '1Added: new']);
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
});
