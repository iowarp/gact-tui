import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransportError, type ToolPresentationBlock } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { repository } = vi.hoisted(() => ({
  repository: {
    readWorkspaceFileBytes: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ name, source }: { name: string; source: { url: string } }) => (
    <div aria-label={`PDF ${name}`}>{source.url}</div>
  ),
}));

import { PresentationNavigation } from './presentation-navigation';
import { WorkspaceFilePresentationBlock } from './tool-result-workspace-file';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 4, 5, 6]);

function renderBlock(
  block: ToolPresentationBlock,
  navigation: Partial<React.ContextType<typeof PresentationNavigation>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, ...navigation } as never}
      >
        <WorkspaceFilePresentationBlock block={block} />
      </PresentationNavigation.Provider>
    </QueryClientProvider>,
  );
}

function imageBlock(overrides: Partial<ToolPresentationBlock> = {}): ToolPresentationBlock {
  return {
    id: 'workspace-file',
    type: 'workspace_file',
    workspace_id: 'ws_1',
    path: 'renders/page-1.png',
    media_type: 'image/png',
    sha256: '',
    ...overrides,
  };
}

function pdfBlock(overrides: Partial<ToolPresentationBlock> = {}): ToolPresentationBlock {
  return {
    id: 'workspace-file',
    type: 'workspace_file',
    workspace_id: 'ws_1',
    path: 'doc.pdf',
    media_type: 'application/pdf',
    sha256: '',
    pages: [2, 3],
    ...overrides,
  };
}

describe('WorkspaceFilePresentationBlock', () => {
  it('renders an image inline and reports it unchanged when the hash matches', async () => {
    repository.readWorkspaceFileBytes.mockResolvedValue(IMAGE_BYTES);
    const sha256 = await sha256Hex(IMAGE_BYTES);

    renderBlock(imageBlock({ sha256 }));

    expect(await screen.findByText('page-1.png')).toBeVisible();
    expect(screen.getByText('image/png')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByLabelText('Changed since the agent viewed it')).not.toBeInTheDocument(),
    );
    expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith(
      'ws_1',
      'renders/page-1.png',
      expect.any(AbortSignal),
    );
  });

  it('renders a PDF preview opened on the first viewed page', async () => {
    repository.readWorkspaceFileBytes.mockResolvedValue(PDF_BYTES);
    const sha256 = await sha256Hex(PDF_BYTES);

    renderBlock(pdfBlock({ sha256 }));

    const viewer = await screen.findByLabelText('PDF doc.pdf');
    expect(viewer).toHaveTextContent(
      'http://127.0.0.1:8790/v1/workspaces/ws_1/files/read?path=doc.pdf',
    );
    expect(screen.getByText('doc.pdf')).toBeVisible();
  });

  it('shows a changed-since-viewed indicator when the live hash no longer matches', async () => {
    repository.readWorkspaceFileBytes.mockResolvedValue(IMAGE_BYTES);

    renderBlock(imageBlock({ sha256: '0'.repeat(64) }));

    expect(await screen.findByLabelText('Changed since the agent viewed it')).toBeVisible();
  });

  it('shows a typed missing-file state and skips the preview when the file is gone', async () => {
    repository.readWorkspaceFileBytes.mockRejectedValue(new TransportError('Not found', 404));

    renderBlock(imageBlock({ sha256: 'a'.repeat(64) }));

    expect(await screen.findByText(/no longer available in the workspace/iu)).toBeVisible();
    expect(screen.getByText('page-1.png')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens the file through the workspace file viewer when the header is activated', async () => {
    const user = userEvent.setup();
    repository.readWorkspaceFileBytes.mockResolvedValue(IMAGE_BYTES);
    const onOpenFile = vi.fn();

    renderBlock(imageBlock({ sha256: await sha256Hex(IMAGE_BYTES) }), { onOpenFile });

    await user.click(await screen.findByRole('button', { name: 'Open page-1.png' }));

    expect(onOpenFile).toHaveBeenCalledWith('renders/page-1.png');
  });

  it('falls back to the transcript workspace id when the block omits its own', async () => {
    repository.readWorkspaceFileBytes.mockResolvedValue(IMAGE_BYTES);

    renderBlock(imageBlock({ workspace_id: undefined, sha256: await sha256Hex(IMAGE_BYTES) }), {
      workspaceId: 'ws_from_transcript',
    });

    await waitFor(() =>
      expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith(
        'ws_from_transcript',
        'renders/page-1.png',
        expect.any(AbortSignal),
      ),
    );
  });
});
