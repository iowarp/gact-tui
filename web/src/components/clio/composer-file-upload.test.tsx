import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer } from './composer';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    workspaceReferences: vi.fn().mockResolvedValue([]),
    connectedSources: vi.fn().mockResolvedValue([]),
    storageProviders: vi.fn().mockResolvedValue({ providers: [] }),
    hostStorageSettings: vi
      .fn()
      .mockResolvedValue({ hostname: 'Test host', effective: { root: '/data' } }),
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

function renderComposer(contextReferences = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments
          contextReferences={contextReferences}
          model="gpt-5.6-luna"
          onSubmit={vi.fn(async () => undefined)}
          provider="codex"
          state="completed"
          workspaceId="ws-test"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
}

describe('ClioComposer file upload surface', () => {
  it('opens from the direct action and delegates browsing to the existing picker', async () => {
    const user = userEvent.setup();
    renderComposer();
    const picker = screen.getByLabelText('Upload files');
    const open = vi.spyOn(picker, 'click');

    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await user.click(screen.getByRole('button', { name: 'Choose files' }));

    const dialog = screen.getByRole('dialog', { name: 'Add attachments' });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText('Drop files to attach')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Select files' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
  });

  it('opens from the add-context menu', async () => {
    const user = userEvent.setup();
    renderComposer(true);

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    await user.click(screen.getByRole('menuitem', { name: 'Attach' }));
    await user.click(screen.getByRole('button', { name: 'Choose files' }));

    expect(screen.getByRole('dialog', { name: 'Add attachments' })).toBeVisible();
  });

  it('opens for a file drag anywhere and attaches a document-level drop', async () => {
    renderComposer();
    const file = new File(['notes'], 'field-notes.md', { type: 'text/markdown' });

    fireEvent.dragEnter(document, {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(screen.getByRole('dialog', { name: 'Add attachments' })).toBeVisible();

    fireEvent.drop(document, {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(await screen.findByRole('button', { name: 'Open field-notes.md' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
  });

  it('attaches a drop on the visible ReUI surface exactly once', async () => {
    const user = userEvent.setup();
    renderComposer();
    const file = new File(['data'], 'observations.csv', { type: 'text/csv' });

    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await user.click(screen.getByRole('button', { name: 'Choose files' }));
    fireEvent.drop(screen.getByRole('region', { name: 'File drop area' }), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(await screen.findAllByRole('button', { name: 'Open observations.csv' })).toHaveLength(1);
  });

  it('ignores non-file drags instead of interrupting the composer', () => {
    renderComposer();

    fireEvent.dragEnter(document, {
      dataTransfer: { files: [], types: ['text/plain'] },
    });

    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
  });

  it('ignores internal image drags and still accepts the next external file drop', async () => {
    renderComposer();
    const file = new File(['image'], 'existing-image.png', { type: 'image/png' });
    const transfer = { files: [file], types: ['Files', 'text/uri-list'] };
    fireEvent.dragStart(document.body, { dataTransfer: transfer });
    fireEvent.dragEnter(document, { dataTransfer: transfer });
    fireEvent.drop(document, { dataTransfer: transfer });
    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open existing-image.png' }),
    ).not.toBeInTheDocument();
    fireEvent.dragEnd(document.body);

    // A cancelled native image drag has no dragend; it must not leave the
    // document marked as dragging when the next external file arrives.
    const cancelledDrag = new Event('dragstart', { bubbles: true, cancelable: true });
    cancelledDrag.preventDefault();
    document.body.dispatchEvent(cancelledDrag);

    fireEvent.dragEnter(document, { dataTransfer: transfer });
    expect(screen.getByRole('dialog', { name: 'Add attachments' })).toBeVisible();
    fireEvent.drop(document, { dataTransfer: transfer });
    expect(await screen.findByRole('button', { name: 'Open existing-image.png' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
  });
});
