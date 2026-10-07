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
vi.mock('@/tauri/documents', () => ({
  openDocumentWorkingCopy: vi.fn().mockResolvedValue(false),
  documentApplications: vi.fn().mockResolvedValue([]),
}));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ fit }: { fit: string }) => <div data-fit={fit}>PDF preview</div>,
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
  it.each(['ooxml-word', 'ooxml-slides', 'ooxml-sheet'] as const)(
    'opens the saved PDF for a %s artifact without converting it again',
    async (profile) => {
      repository.documentManifest.mockImplementation(async (id: string) =>
        id === 'artifact_pdf'
          ? { ...manifest, artifact_id: id, name: 'preview.pdf', profile: 'pdf' }
          : { ...manifest, profile, pdf_rendition_artifact_id: 'artifact_pdf' },
      );
      repository.documentContent.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
      repository.artifactReviews.mockResolvedValue([]);
      renderWorkspace();

      expect(await screen.findByText('PDF preview')).toBeVisible();
      expect(screen.getByText('PDF preview')).toHaveAttribute('data-fit', 'width');
      await userEvent.click(screen.getByRole('button', { name: 'Document information' }));
      expect(screen.getByText('Saved PDF preview')).toBeVisible();
      expect(screen.queryByText('PDF document')).not.toBeInTheDocument();
      expect(repository.documentContent).toHaveBeenCalledWith('artifact_pdf', expect.anything());
      expect(repository.createDocumentRendition).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
      expect(screen.getByRole('menuitem', { name: 'PDF preview' })).toBeVisible();
    },
  );

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
    expect(screen.queryByText(/Version 3, aaaaaaaaaaaa/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Document information' }));
    expect(screen.getByText(`Version 3, ${manifest.sha256}`)).toBeVisible();
    await user.keyboard('{Escape}');
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

  it('cleans converted bullet glyphs in preview while preserving the raw Markdown', async () => {
    const user = userEvent.setup();
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockResolvedValue(
      new TextEncoder().encode('## Contents\n\n- \uF0B7 Groups\n- Datasets'),
    );
    repository.artifactReviews.mockResolvedValue([]);
    renderWorkspace();

    expect(await screen.findByText('Groups')).toBeVisible();
    expect(screen.queryByText(/\uF0B7 Groups/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Read raw' }));
    expect(screen.getByRole('region', { name: 'Raw Markdown for evidence.md' })).toHaveTextContent(
      '\uF0B7 Groups',
    );
    expect(screen.getByRole('button', { name: 'Copy raw evidence.md' })).toBeVisible();
  });

  it('settles into a readable preview-only state when the registered revision is gone', async () => {
    const user = userEvent.setup();
    repository.documentManifest.mockRejectedValue(
      new Error('artifact not found: artifact_internal_123'),
    );
    renderWorkspace();

    const warning = await screen.findByRole('button', { name: /Preview only/u });
    expect(warning).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Document information' }));
    expect(screen.getByText('Saved content is readable.')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByText(/original registered revision could not be loaded/u),
    ).not.toBeInTheDocument();
    await user.click(warning);
    expect(screen.getByText(/original registered revision could not be loaded/u)).toBeVisible();
    expect(screen.getByText('Fallback preview')).toBeVisible();
    expect(screen.queryByText('Checking document capabilities…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Technical details' })).toHaveAttribute(
      'data-state',
      'closed',
    );
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

    await user.click(await screen.findByRole('button', { name: 'Open in' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy path' }));
    expect(repository.createDocumentWorkingCopy).toHaveBeenCalledWith('artifact_3', {
      session_id: 'sess_1',
      provider: 'native',
      writable: true,
      auto_checkpoint: true,
    });
    expect(await screen.findByText(/Working-copy path copied/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Document information' }));
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
  });

  it('checks editor availability again before creating an editable copy', async () => {
    repository.documentManifest.mockResolvedValue({
      ...manifest,
      embedded_editors: ['onlyoffice'],
    });
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('# Evidence'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.documentEditorHealth
      .mockResolvedValueOnce({
        editors: [{ provider: 'onlyoffice', configured: true, healthy: true }],
      })
      .mockResolvedValue({
        editors: [{ provider: 'onlyoffice', configured: true, healthy: false }],
      });
    renderWorkspace();
    await userEvent.click(await screen.findByRole('button', { name: 'Open in' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ONLYOFFICE' }));
    expect(await screen.findByText(/ONLYOFFICE is unavailable/)).toBeVisible();
    expect(repository.createDocumentWorkingCopy).not.toHaveBeenCalled();
    expect(repository.createDocumentEditorSession).not.toHaveBeenCalled();
  });

  it('closes a working copy when its editor cannot launch and keeps the preview readable', async () => {
    repository.documentManifest.mockResolvedValue({
      ...manifest,
      embedded_editors: ['onlyoffice'],
    });
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('# Evidence'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.documentEditorHealth.mockResolvedValue({
      editors: [{ provider: 'onlyoffice', configured: true, healthy: true }],
    });
    repository.createDocumentWorkingCopy.mockResolvedValue({
      id: 'copy_failed',
      path: 'confined.docx',
    });
    repository.createDocumentEditorSession.mockResolvedValue({
      status: 'unavailable',
      error: 'Editor connection refused',
    });
    repository.closeDocumentWorkingCopy.mockResolvedValue({ id: 'copy_failed', status: 'closed' });
    renderWorkspace();
    await userEvent.click(await screen.findByRole('button', { name: 'Open in' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ONLYOFFICE' }));
    expect(await screen.findByText('Editor connection refused')).toBeVisible();
    expect(repository.closeDocumentWorkingCopy).toHaveBeenCalledWith('copy_failed');
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });
});
