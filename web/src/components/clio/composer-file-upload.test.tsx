import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportError } from '@clio/core/v3';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer } from './composer';

const repository = vi.hoisted(() => ({
  workspaceReferences: vi.fn(),
  connectedSources: vi.fn(),
  storageProviders: vi.fn(),
  hostStorageSettings: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  repository.workspaceReferences.mockResolvedValue([]);
  repository.connectedSources.mockResolvedValue([]);
  repository.storageProviders.mockResolvedValue({
    providers: [{ id: 'google_drive', name: 'Google Drive', configured: true }],
  });
  repository.hostStorageSettings.mockResolvedValue({
    hostname: 'Test host',
    effective: { root: '/data' },
  });
});
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

/** The + becomes a menu once the service shows it offers connected data. */
const attachMenu = () =>
  vi.waitFor(() => {
    const button = screen.getByRole('button', { name: 'Attach files' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    return button;
  });

async function openDropSurface(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await attachMenu());
  await user.click(screen.getByRole('menuitem', { name: 'From connected data…' }));
  await user.click(screen.getByRole('button', { name: 'Choose files' }));
}

describe('ClioComposer file upload surface', () => {
  it('offers no connected-data route on a service without connected data', async () => {
    repository.connectedSources.mockRejectedValue(new TransportError('Not Found', 404));
    const user = userEvent.setup();
    renderComposer();
    const open = vi.spyOn(screen.getByLabelText('Upload files'), 'click');
    await vi.waitFor(() => expect(repository.connectedSources).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    const attach = screen.getByRole('button', { name: 'Attach files' });
    expect(attach).not.toHaveAttribute('aria-haspopup');
    await user.click(attach);

    // Straight to the system picker: no menu, no dialog onto a dead end.
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the system file picker straight from the attach menu', async () => {
    const user = userEvent.setup();
    renderComposer();
    const picker = screen.getByLabelText('Upload files');
    const open = vi.spyOn(picker, 'click');

    await user.click(await attachMenu());
    await user.click(screen.getByRole('menuitem', { name: 'Upload files…' }));

    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('delegates browsing from the drop surface to the existing picker', async () => {
    const user = userEvent.setup();
    renderComposer(true);
    const picker = screen.getByLabelText('Upload files');
    const open = vi.spyOn(picker, 'click');

    await openDropSurface(user);

    const dialog = screen.getByRole('dialog', { name: 'Add attachments' });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText('Drop files to attach')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Select files' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Add attachments' })).not.toBeInTheDocument();
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

    await openDropSurface(user);
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
