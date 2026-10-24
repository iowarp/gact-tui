import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TransportError } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactView, WorkspaceFileView } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readArtifactBytesFor: vi.fn(),
    readArtifactTextFor: vi.fn(),
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileBytes: vi.fn(),
    workspaceFiles: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('ace-builds/src-noconflict/mode-json', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-markdown', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-python', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-sh', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-text', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-toml', () => ({}));
vi.mock('ace-builds/src-noconflict/mode-yaml', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-github', () => ({}));
vi.mock('ace-builds/src-noconflict/theme-one_dark', () => ({}));
vi.mock('react-ace', () => ({
  default: ({
    value,
    onChange,
    'aria-label': ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    'aria-label'?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));
vi.mock('./document-workspace', () => ({
  ClioDocumentWorkspace: ({ fallbackPreview }: { fallbackPreview: ReactNode }) => (
    <>{fallbackPreview}</>
  ),
}));
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ name, bytes }: { name: string; bytes: Uint8Array }) => (
    <div aria-label={`PDF ${name}`}>{`${bytes.byteLength} bytes`}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArtifactView', () => {
  it('recovers a missing nested artifact on demand when the directory root has not loaded it', async () => {
    repository.readArtifactTextFor.mockRejectedValue(new TransportError('missing', 404));
    repository.workspaceFiles.mockResolvedValue({
      entries: [{ path: 'analysis/result.txt', type: 'file', internal: false, size: 30 }],
      truncated: false,
    });
    repository.readWorkspaceFile.mockResolvedValue('Recovered nested result');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArtifactView
          artifact={{
            id: 'artifact_text',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'result.txt',
            media_type: 'text/plain',
            size: 30,
            uri: 'artifact://workspace_1/result.txt@v1',
          }}
          files={[]}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Recovered nested result')).toBeVisible();
    expect(repository.workspaceFiles).toHaveBeenCalledWith('workspace_1', expect.any(AbortSignal), {
      excludeServiceStorage: true,
    });
    expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
      'workspace_1',
      'analysis/result.txt',
      expect.any(AbortSignal),
    );
  });

  it.each([false, true])('reports workspace recovery only when it occurs (%s)', async (missing) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (missing) {
      repository.readArtifactTextFor.mockRejectedValue(new TransportError('missing', 404));
    } else {
      repository.readArtifactTextFor.mockResolvedValue('Saved result');
    }
    repository.readWorkspaceFile.mockResolvedValue('Recovered result');
    render(
      <QueryClientProvider client={queryClient}>
        <ArtifactView
          artifact={{
            id: 'artifact_text',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'result.txt',
            media_type: 'text/plain',
            size: 30,
            uri: 'artifact://workspace_1/result.txt@v1',
          }}
          files={[{ path: 'result.txt', type: 'file', size: 30, internal: false }]}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );
    await screen.findByText(missing ? 'Recovered result' : 'Saved result');
    expect(Boolean(screen.queryByText('Recovered from the matching workspace file.'))).toBe(
      missing,
    );
    expect(repository.readWorkspaceFile).toHaveBeenCalledTimes(missing ? 1 : 0);
  });

  it('renders Markdown as a readable wrapping document instead of source code', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readArtifactTextFor.mockResolvedValue(
      '# HDF5 report\n\nA long scientific sentence that should reflow with the document column.',
    );

    render(
      <QueryClientProvider client={queryClient}>
        <ArtifactView
          artifact={{
            id: 'artifact_report',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'report.md',
            media_type: 'text/markdown',
            size: 96,
            uri: 'artifact://workspace_1/report.md@v1',
          }}
          files={[]}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    const heading = await screen.findByRole('heading', { name: 'HDF5 report' }, { timeout: 5000 });
    expect(heading.closest('article')).toHaveClass('min-w-0');
    expect(document.querySelector('[data-language="markdown"]')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('# HDF5 report');
  });

  it('renders an SVG figure through the image viewer', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readArtifactBytesFor.mockResolvedValue(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <ArtifactView
          artifact={{
            id: 'artifact_figure',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'scan-speed.svg',
            media_type: 'image/svg+xml',
            size: 54,
            uri: 'artifact://workspace_1/scan-speed.svg@v1',
          }}
          files={[]}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    const imageCanvas = await screen.findByLabelText('Zoomable image scan-speed.svg');
    expect(imageCanvas).toBeVisible();
    // A scroll viewport has an intrinsically sized content wrapper. A fitted
    // image instead needs the actual panel height when the canvas is expanded.
    expect(imageCanvas.closest('[data-slot="scroll-area"]')).toBeNull();
    expect(imageCanvas.closest('[role="tabpanel"]')?.firstElementChild).toHaveClass('h-full');
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
  });
});

describe('WorkspaceFileView', () => {
  function renderFile(view: ReactNode) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}>{view}</QueryClientProvider>);
  }

  it('shows CSV identity once in the preview control and keeps the count in pagination', async () => {
    repository.readWorkspaceFile.mockResolvedValue(
      `station,count\n${Array.from({ length: 25 }, (_, index) => `MTA${index},${index}`).join('\n')}`,
    );
    renderFile(
      <WorkspaceFileView path="stations.csv" mediaType="text/csv" workspaceId="workspace_1" />,
    );
    expect(await screen.findByText('MTA0')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveTextContent('stations.csv');
    expect(screen.getAllByText('stations.csv', { exact: true })).toHaveLength(1);
    expect(screen.queryByText('CSV preview')).not.toBeInTheDocument();
    expect(screen.queryByText(/parsed rows/u)).not.toBeInTheDocument();
    expect(screen.getByText('1 - 10 of 25')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('11 - 20 of 25')).toBeVisible();
    expect(screen.getByText('MTA10')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download file' })).toBeEnabled();
  });

  it.each([
    ['notes.md', 'text/markdown', '# Field notes'],
    ['status.json', 'application/json', '{"state":"ready"}'],
    ['stations.json', 'application/json', '[{"station":"MTA1","count":25}]'],
    ['pipeline.py', 'text/x-python', 'print("ready")'],
  ])(
    'shows one file identity for %s while retaining its source view',
    async (name, mediaType, content) => {
      repository.readWorkspaceFile.mockResolvedValue(content);
      renderFile(<WorkspaceFileView path={name} mediaType={mediaType} workspaceId="workspace_1" />);
      await waitFor(() =>
        expect(screen.queryByLabelText(`Loading ${name}`)).not.toBeInTheDocument(),
      );
      expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
      const toolbar = document.querySelector('[data-slot="viewer-toolbar"]') as HTMLElement;
      expect(
        within(toolbar).getByRole('tab', { name: 'Preview', selected: true }),
      ).toHaveTextContent(name);
      const source = screen.queryByRole('tab', { name: 'Source' });
      if (source) await userEvent.click(source);
      expect(document.querySelector('pre')).toHaveTextContent(content);
      expect(screen.getByRole('button', { name: `Copy ${name}` })).toBeVisible();
      expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
    },
  );

  it.each(['cat.html', 'cat.HTM', 'unlabelled.txt'])(
    'renders HTML %s with its exact source available',
    async (path) => {
      repository.readWorkspaceFile.mockResolvedValue('<h1>Pedal!</h1>');
      renderFile(
        <WorkspaceFileView
          mediaType="text/html; charset=utf-8"
          path={path}
          size={100}
          workspaceId="workspace_1"
        />,
      );
      expect(await screen.findByTitle(`HTML preview of ${path}`)).toBeVisible();
      expect(document.querySelectorAll('[data-slot="viewer-toolbar"]')).toHaveLength(1);
      const toolbar = screen
        .getByRole('tab', { name: 'Preview' })
        .closest('[data-slot="viewer-toolbar"]');
      expect(toolbar).not.toBeNull();
      expect(toolbar).toContainElement(screen.getByRole('tab', { name: 'Source' }));
      expect(screen.queryByText(/Static preview ·/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
      expect(document.querySelector('[data-language="html"]')).toHaveTextContent('<h1>Pedal!</h1>');
      await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
      expect(screen.getByTitle(`HTML preview of ${path}`)).toBeVisible();
      expect(repository.readWorkspaceFile).toHaveBeenCalledTimes(1);
      expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
        'workspace_1',
        path,
        expect.any(AbortSignal),
      );
    },
  );

  it('reads a workspace PDF through the repository transport, never a raw URL', async () => {
    // The desktop reaches the backend only through the app transport; a URL
    // handed to PDF.js would bypass it and fail.
    repository.readWorkspaceFileBytes.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    renderFile(
      <WorkspaceFileView
        mediaType="application/pdf"
        path="reports/remote paper.pdf"
        size={50_000}
        workspaceId="workspace_1"
      />,
    );

    const viewer = await screen.findByLabelText('PDF remote paper.pdf');
    expect(viewer).toHaveTextContent('4 bytes');
    expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith(
      'workspace_1',
      'reports/remote paper.pdf',
      expect.any(AbortSignal),
    );
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
  });

  it('shows the read error instead of an endless PDF loading state', async () => {
    repository.readWorkspaceFileBytes.mockRejectedValue(new Error('file not found: missing.pdf'));
    renderFile(
      <WorkspaceFileView
        mediaType="application/pdf"
        path="missing.pdf"
        workspaceId="workspace_1"
      />,
    );

    expect(await screen.findByText('PDF preview unavailable')).toBeVisible();
    expect(screen.getByText('file not found: missing.pdf')).toBeVisible();
  });

  it('presents unsupported binary metadata and controls instead of a code block', async () => {
    renderFile(
      <WorkspaceFileView
        mediaType="application/x-hdf5"
        path="data/run.h5"
        size={4096}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByText('run.h5')).toBeVisible();
    expect(screen.getByText(/application\/x-hdf5/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Download file' })).toHaveLength(1);
    expect(document.querySelector('pre code')).not.toBeInTheDocument();
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
    expect(screen.queryByText('data/run.h5')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'File information' }));
    expect(await screen.findByText('data/run.h5')).toBeVisible();
  });

  it('aborts the previous text preview when selection changes', async () => {
    let firstSignal: AbortSignal | undefined;
    repository.readWorkspaceFile.mockImplementation(
      (_workspaceId: string, path: string, signal: AbortSignal) => {
        if (path === 'first.txt') {
          firstSignal = signal;
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          });
        }
        return Promise.resolve('second file');
      },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceFileView mediaType="text/plain" path="first.txt" workspaceId="workspace_1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(firstSignal).toBeDefined());

    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <WorkspaceFileView mediaType="text/plain" path="second.txt" workspaceId="workspace_1" />
      </QueryClientProvider>,
    );

    await screen.findByText('second file');
    expect(firstSignal?.aborted).toBe(true);
  });
});
