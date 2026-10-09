import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioDocumentWorkspace } from './document-workspace';
import type { Artifact } from '@clio/core/v3';
import { documentApplications, openDocumentWorkingCopy, openFileBytes } from '@/tauri/documents';
import { downloadBytes } from './surface-export';
import { vocab } from '@/lib/brand-vocabulary';

const host = vi.hoisted(() => ({ native: true }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => host.native }));
vi.mock('./surface-export', () => ({ downloadBytes: vi.fn() }));

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
  openDocumentWorkingCopy: vi.fn().mockResolvedValue(undefined),
  openFileBytes: vi.fn().mockResolvedValue('desktop-copy'),
  documentApplications: vi.fn().mockResolvedValue([]),
}));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ fit }: { fit: string }) => <div data-fit={fit}>PDF preview</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  host.native = true;
  vi.mocked(openDocumentWorkingCopy).mockResolvedValue(undefined);
  vi.mocked(documentApplications).mockImplementation(async (name) =>
    name.endsWith('.pdf')
      ? [{ id: 'pdf-app', name: 'PDF Reader', is_default: true }]
      : [{ id: 'editor', name: 'Test Editor', is_default: true }],
  );
});

function renderWorkspace(artifactOverrides: Partial<Artifact> = {}) {
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
          ...artifactOverrides,
        }}
        fallbackPreview={<p>Fallback preview</p>}
      />
    </QueryClientProvider>,
  );
}

describe('ClioDocumentWorkspace', () => {
  it('converts once and opens/downloads the PDF bytes while keeping the source preview', async () => {
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockImplementation(async (id: string) =>
      new TextEncoder().encode(id === 'new_pdf' ? '%PDF-test' : '# Source stays here'),
    );
    repository.artifactReviews.mockResolvedValue([]);
    repository.createDocumentRendition.mockResolvedValue({
      converter: 'test-converter',
      artifact: { ...manifest, artifact_id: 'new_pdf', profile: 'pdf', name: 'evidence.pdf' },
    });
    repository.createDocumentWorkingCopy.mockResolvedValue({
      id: 'pdf_copy',
      path: 'confined/evidence.pdf',
    });
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Open in' }));
    await user.click(await screen.findByRole('menuitem', { name: 'PDF Reader (default)' }));
    expect(repository.createDocumentWorkingCopy).toHaveBeenCalledWith('new_pdf', {
      session_id: 'sess_1',
      provider: 'native',
      writable: false,
      auto_checkpoint: false,
    });
    expect(openDocumentWorkingCopy).toHaveBeenCalledWith('confined/evidence.pdf', 'pdf-app');
    expect(await screen.findByText('Source stays here')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open in' }));
    await user.click(screen.getByRole('menuitem', { name: 'Download PDF' }));
    expect(await screen.findByText('PDF downloaded.')).toBeInTheDocument();
    expect(repository.createDocumentRendition).toHaveBeenCalledTimes(1);
    expect(downloadBytes).toHaveBeenCalledWith(
      new TextEncoder().encode('%PDF-test'),
      'application/pdf',
      'evidence.pdf',
    );
  });

  it('opens a remote document as a desktop copy and closes its unused server copy', async () => {
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('Remote source'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.createDocumentWorkingCopy.mockResolvedValue({
      id: 'remote_copy',
      path: '/server/file.md',
    });
    repository.closeDocumentWorkingCopy.mockResolvedValue({ id: 'remote_copy', status: 'closed' });
    vi.mocked(openDocumentWorkingCopy).mockRejectedValueOnce(
      'document path is unavailable: remote',
    );
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Open in' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Test Editor (default)' }));
    expect(await screen.findByText(/Opened a desktop copy; edits are local/)).toBeInTheDocument();
    expect(openFileBytes).toHaveBeenCalledWith(
      'evidence.md',
      new TextEncoder().encode('Remote source'),
      'editor',
    );
    expect(repository.closeDocumentWorkingCopy).toHaveBeenCalledWith('remote_copy');
  });

  it('reports conversion failure without opening the original file in a PDF app', async () => {
    repository.documentManifest.mockResolvedValue(manifest);
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('Source'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.createDocumentRendition.mockRejectedValueOnce(new Error('Converter unavailable'));
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Open in' }));
    await user.click(await screen.findByRole('menuitem', { name: 'PDF Reader (default)' }));
    expect(await screen.findByText('Converter unavailable')).toBeVisible();
    expect(openDocumentWorkingCopy).not.toHaveBeenCalled();
    expect(repository.createDocumentWorkingCopy).not.toHaveBeenCalled();
  });
  it.each([
    ['notes.md', 'markdown', 'Read raw', 'Raw Markdown for notes.md'],
    ['article.tex', 'latex', 'LaTeX source', 'LaTeX source for article.tex'],
  ] as const)(
    'opens the original source from the %s menu',
    async (name, profile, action, region) => {
      repository.documentManifest.mockResolvedValue({ ...manifest, name, profile });
      repository.documentContent.mockResolvedValue(
        new TextEncoder().encode('Original source text'),
      );
      repository.artifactReviews.mockResolvedValue([]);
      renderWorkspace({ name });
      await userEvent.click(await screen.findByRole('tab', { name: action }));
      expect(await screen.findByRole('region', { name: region })).toHaveTextContent(
        'Original source text',
      );
      expect(repository.createDocumentRendition).not.toHaveBeenCalled();
    },
  );

  it('renders HTML and switches between its source and preview without requesting a PDF', async () => {
    const source = '<h1>Pedal!</h1><script>window.original = true;</script>';
    repository.documentManifest.mockResolvedValue({
      ...manifest,
      name: 'cat.html',
      profile: 'html-static',
      mime_type: 'text/html',
    });
    repository.documentContent.mockResolvedValue(new TextEncoder().encode(source));
    repository.artifactReviews.mockResolvedValue([]);
    const { container } = renderWorkspace({ name: 'cat.html', media_type: 'text/html' });
    const frame = await screen.findByTitle('HTML preview of cat.html');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).not.toContain('window.original');
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'HTML source' }));
    expect(container.querySelector('[data-language="html"]')).toHaveTextContent(
      'window.original = true;',
    );
    await user.click(screen.getByRole('tab', { name: 'HTML preview' }));
    expect(screen.getByTitle('HTML preview of cat.html')).toBeVisible();
    expect(repository.createDocumentRendition).not.toHaveBeenCalled();
  });

  it('uses a read-only non-watched HTML copy for its native app', async () => {
    repository.documentManifest.mockResolvedValue({
      ...manifest,
      name: 'cat.html',
      profile: 'html-static',
      mime_type: 'text/html',
    });
    repository.documentContent.mockResolvedValue(new TextEncoder().encode('<h1>Pedal!</h1>'));
    repository.artifactReviews.mockResolvedValue([]);
    repository.createDocumentWorkingCopy.mockResolvedValue({
      id: 'copy_html',
      path: 'confined/cat.html',
    });
    renderWorkspace({ name: 'cat.html', media_type: 'text/html' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open in' }));
    await user.click(screen.getByRole('menuitem', { name: 'Test Editor (default)' }));
    expect(repository.createDocumentWorkingCopy).toHaveBeenCalledWith('artifact_3', {
      session_id: 'sess_1',
      provider: 'native',
      writable: false,
      auto_checkpoint: false,
    });
    expect(await screen.findByText('cat.html opened in Test Editor.')).toBeInTheDocument();
  });

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
      expect(screen.getByRole('menuitem', { name: 'Download PDF' })).toBeVisible();
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
    await user.click(screen.getByRole('menuitem', { name: 'Test Editor (default)' }));
    expect(repository.createDocumentWorkingCopy).toHaveBeenCalledWith('artifact_3', {
      session_id: 'sess_1',
      provider: 'native',
      writable: true,
      auto_checkpoint: true,
    });
    expect(await screen.findByText(/evidence.md opened in Test Editor/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Document information' }));
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
  });

  it('checks editor availability again before creating an editable copy', async () => {
    repository.documentManifest.mockResolvedValue({
      ...manifest,
      name: 'evidence.docx',
      profile: 'ooxml-word',
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
    renderWorkspace({ name: 'evidence.docx' });
    await userEvent.click(await screen.findByRole('button', { name: 'Open in' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: `ONLYOFFICE (in ${vocab.agent})` }),
    );
    expect(await screen.findByText(/ONLYOFFICE is unavailable/)).toBeVisible();
    expect(repository.createDocumentWorkingCopy).not.toHaveBeenCalled();
    expect(repository.createDocumentEditorSession).not.toHaveBeenCalled();
  });

  it('closes a working copy when its editor cannot launch and keeps the preview readable', async () => {
    const wordManifest = {
      ...manifest,
      name: 'evidence.docx',
      profile: 'ooxml-word' as const,
      embedded_editors: ['onlyoffice'],
      pdf_rendition_artifact_id: 'saved_pdf',
    };
    repository.documentManifest.mockImplementation(async (id: string) =>
      id === 'saved_pdf'
        ? { ...manifest, artifact_id: id, name: 'evidence.pdf', profile: 'pdf' }
        : wordManifest,
    );
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
    renderWorkspace({ name: 'evidence.docx' });
    await userEvent.click(await screen.findByRole('button', { name: 'Open in' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: `ONLYOFFICE (in ${vocab.agent})` }),
    );
    expect(await screen.findByText('Editor connection refused')).toBeVisible();
    expect(repository.closeDocumentWorkingCopy).toHaveBeenCalledWith('copy_failed');
    expect(await screen.findByText('PDF preview')).toBeVisible();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });
});
