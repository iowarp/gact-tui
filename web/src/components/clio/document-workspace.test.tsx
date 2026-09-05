import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioDocumentWorkspace } from './document-workspace';

const manifest = {
  artifact_id: 'artifact_3',
  workspace_id: 'ws_1',
  name: 'evidence.md',
  version: 3,
  sha256: 'a'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown' as const,
  content_url: '/v1/artifacts/artifact_3/document/content',
  anchors: ['text-quote' as const],
  native_open: true,
  embedded_editors: [],
  rendition_formats: ['pdf'],
  provenance: {},
};

const repository = vi.hoisted(() => ({
  documentManifest: vi.fn(),
  documentContent: vi.fn(),
  artifactReviews: vi.fn(),
  documentEditorHealth: vi.fn(),
  submitArtifactReview: vi.fn(),
  createDocumentRendition: vi.fn(),
  createDocumentWorkingCopy: vi.fn(),
  createDocumentEditorSession: vi.fn(),
  closeDocumentWorkingCopy: vi.fn(),
  resolveDocumentConflict: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/tauri/documents', () => ({ openDocumentWorkingCopy: vi.fn().mockResolvedValue(false) }));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: () => <div>PDF preview</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClioDocumentWorkspace
        artifact={{
          id: 'artifact_3',
          session_id: 'sess_1',
          workspace_id: 'ws_1',
          name: 'evidence.md',
          media_type: 'text/markdown',
          uri: 'artifact://ws_1/evidence.md@v3',
        }}
        fallbackPreview={<p>Fallback preview</p>}
      />
    </QueryClientProvider>,
  );
}

describe('ClioDocumentWorkspace', () => {
  it('renders immutable content and sends a selected quote to the agent', async () => {
    const user = userEvent.setup();
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockResolvedValue(
      new TextEncoder().encode('# Evidence\n\nBounded claim from the source.'),
    );
    repository.artifactReviews.mockResolvedValue([]);
    repository.submitArtifactReview.mockResolvedValue({ id: 'review_1' });
    renderWorkspace();

    expect(
      await screen.findByText('Bounded claim from the source.', undefined, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByText(/Version 3, aaaaaaaaaaaa/)).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Document details' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Document safety' }));
    expect(screen.getByText('Immutable document boundary')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Read document' }));
    const claim = screen.getByText('Bounded claim from the source.');
    const range = document.createRange();
    range.selectNodeContents(claim);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(claim);
    await user.click(screen.getByRole('button', { name: 'Review selection' }));
    await user.type(screen.getByRole('textbox', { name: 'Review instruction' }), 'Verify this.');
    await user.click(screen.getByRole('button', { name: 'Send review' }));

    expect(repository.submitArtifactReview).toHaveBeenCalledWith(
      'sess_1',
      expect.objectContaining({
        artifact_id: 'artifact_3',
        expected_version: 3,
        expected_sha256: 'a'.repeat(64),
        anchor: {
          profile: 'text-quote',
          exact: 'Bounded claim from the source.',
          source_path: 'evidence.md',
        },
        text: 'Verify this.',
      }),
    );
    expect(await screen.findByText(/Review sent to the agent/)).toBeInTheDocument();
  });

  it('settles into a readable preview-only state when the registered revision is gone', async () => {
    const user = userEvent.setup();
    repository.documentManifest.mockRejectedValue(
      new Error('artifact not found: artifact_internal_123'),
    );
    renderWorkspace();

    const warning = await screen.findByRole('button', { name: /Preview only/u });
    expect(warning).toBeVisible();
    expect(screen.getByText('Saved content is readable.')).toBeVisible();
    expect(
      screen.queryByText(/original registered revision could not be loaded/u),
    ).not.toBeInTheDocument();
    await user.click(warning);
    expect(screen.getByText(/original registered revision could not be loaded/u)).toBeVisible();
    expect(screen.getByText('Fallback preview')).toBeVisible();
    expect(screen.queryByText('Checking document capabilities…')).not.toBeInTheDocument();
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses a confined working copy without duplicating artifact history inside the document', async () => {
    const user = userEvent.setup();
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('Evidence'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.createDocumentWorkingCopy.mockResolvedValue({
      id: 'copy_1',
      session_id: 'sess_1',
      workspace_id: 'ws_1',
      artifact_name: 'evidence.md',
      base_artifact_id: 'artifact_3',
      head_artifact_id: 'artifact_3',
      base_version: 3,
      head_version: 3,
      base_sha256: 'a'.repeat(64),
      last_sha256: 'a'.repeat(64),
      path: 'D:\\workspace\\.clio\\documents\\working-copies\\copy_1\\evidence.md',
      provider: 'native',
      writable: true,
      auto_checkpoint: true,
      status: 'active',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
      native_comment_fingerprints: [],
    });
    renderWorkspace();

    await user.click(await screen.findByRole('button', { name: 'Open in desktop app' }));
    expect(repository.createDocumentWorkingCopy).toHaveBeenCalledWith('artifact_3', {
      session_id: 'sess_1',
      provider: 'native',
      writable: true,
      auto_checkpoint: true,
    });
    expect(await screen.findByText(/Working-copy path copied/)).toBeInTheDocument();
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
  });
});
