import { cleanup, render as renderView, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionDiff } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { copyText } from '@/lib/clipboard';
import { DiffCanvasView } from './diff-canvas-view';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => {}) }));

afterEach(cleanup);

function render(view: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderView(<QueryClientProvider client={client}>{view}</QueryClientProvider>);
}

const diff: SessionDiff = {
  id: 'chg_1',
  path: 'src/analysis.py',
  status: 'applied',
  created: false,
  undo_available: true,
  unified_diff: '@@ -1 +1 @@\n-old\n+new',
};

describe('DiffCanvasView', () => {
  it('records an applied change and requires confirmation before undoing it', async () => {
    const user = userEvent.setup();
    const undo = vi.fn().mockResolvedValue(undefined);
    render(<DiffCanvasView diff={diff} onOpenFile={vi.fn()} onUndo={undo} />);

    expect(screen.getByRole('heading', { name: 'File changed by the agent' })).toBeInTheDocument();
    const frame = screen.getByRole('toolbar', { name: 'Change' });
    expect(within(frame).getByLabelText('Location')).toHaveTextContent('src');
    expect(within(frame).getByLabelText('Location')).toHaveTextContent('analysis.py');
    expect(within(frame).getByText('Changed')).toBeInTheDocument();
    expect(within(frame).getByLabelText('1 added, 1 removed')).toHaveTextContent('+1');
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo this change' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/back as it was before this change/i)).toBeVisible();
    expect(undo).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledWith('chg_1');
  });

  it('says why a change cannot be undone instead of offering Undo', () => {
    render(
      <DiffCanvasView
        diff={{
          ...diff,
          undo_available: false,
          undo_unavailable_reason: 'previous_content_too_large',
        }}
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Undo this change' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(/over 256 KiB/i)).toBeVisible();
  });

  it('shows an undone change as settled', () => {
    render(
      <DiffCanvasView
        diff={{ ...diff, status: 'reverted', undo_available: false }}
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('This change was undone.')).toBeVisible();
    expect(screen.getByText('Undone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo this change' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('keeps an authoritative undo refusal visible', () => {
    render(
      <DiffCanvasView
        diff={diff}
        error="file_changed_since_write: src/analysis.py changed after the agent wrote it"
        onOpenFile={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('The change was not undone')).toBeVisible();
    expect(screen.getByText(/changed after the agent wrote it/i)).toBeVisible();
  });

  it('copies the diff and opens the file from the frame bar', async () => {
    const user = userEvent.setup();
    const openFile = vi.fn();
    render(<DiffCanvasView diff={diff} onOpenFile={openFile} onUndo={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy contents' }));
    expect(copyText).toHaveBeenCalledWith(diff.unified_diff);
    await user.click(screen.getByRole('button', { name: 'Open the file' }));
    expect(openFile).toHaveBeenCalledWith('src/analysis.py');
    expect(screen.getByRole('button', { name: 'Comments' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
