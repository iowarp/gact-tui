import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TransportError } from '@clio/core/v3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OPEN_BROWSER_PAGE_EVENT } from '@/lib/html-in-browser';
import { rangeReadsFromText } from '@/test/workspace-file-range';
import { narrowFrameBars } from '@/test/narrow-frame-bars';
import { ArtifactView, WorkspaceFileView } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readArtifactBytesFor: vi.fn(),
    readArtifactTextFor: vi.fn(),
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileBytes: vi.fn(),
    readWorkspaceFileRange: vi.fn(),
    workspaceFiles: vi.fn(),
    openBrowserFile: vi.fn(),
    commentTarget: vi.fn(),
    createCommentTarget: vi.fn(),
    // No x_clio_hdf5_viewer unless a test grants it: HDF5 then opens as binary.
    capabilities: vi.fn(),
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

repository.readWorkspaceFileRange.mockImplementation(
  rangeReadsFromText(repository.readWorkspaceFile),
);

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ArtifactView', () => {
  it('recovers a missing nested artifact on demand when the directory root has not loaded it', async () => {
    repository.readArtifactTextFor.mockRejectedValue(new TransportError('missing', 404));
    repository.workspaceFiles.mockResolvedValue({
      entries: [{ path: 'analysis/result.txt', type: 'file', internal: false, size: 30 }],
      truncated: false,
    });
    repository.readWorkspaceFileBytes.mockResolvedValue(
      new TextEncoder().encode('Recovered nested result'),
    );
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
            sha256: createHash('sha256').update('Recovered nested result').digest('hex'),
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
    expect(screen.getByRole('tab', { name: 'Lineage' })).toBeVisible();
    expect(repository.workspaceFiles).toHaveBeenCalledWith('workspace_1', expect.any(AbortSignal), {
      excludeServiceStorage: true,
    });
    expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith(
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
    repository.readWorkspaceFileBytes.mockResolvedValue(
      new TextEncoder().encode('Recovered result'),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ArtifactView
          artifact={{
            id: 'artifact_text',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'result.txt',
            sha256: createHash('sha256')
              .update(missing ? 'Recovered result' : 'Saved result')
              .digest('hex'),
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
    expect(repository.readWorkspaceFileBytes).toHaveBeenCalledTimes(missing ? 1 : 0);
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

  it('shows CSV identity once in the preview control and every row in one continuous grid', async () => {
    repository.readWorkspaceFile.mockResolvedValue(
      `station,count\n${Array.from({ length: 25 }, (_, index) => `MTA${index},${index}`).join('\n')}`,
    );
    renderFile(
      <WorkspaceFileView path="stations.csv" mediaType="text/csv" workspaceId="workspace_1" />,
    );
    expect(await screen.findByText('MTA0')).toBeVisible();
    expect(screen.getByLabelText('Location')).toHaveTextContent('stations.csv');
    expect(screen.getAllByText('stations.csv', { exact: true })).toHaveLength(1);
    expect(screen.queryByText('CSV preview')).not.toBeInTheDocument();
    expect(screen.queryByText(/parsed rows/u)).not.toBeInTheDocument();
    const grid = screen.getByRole('grid', { name: 'stations.csv' });
    expect(grid).toHaveAttribute('aria-rowcount', '26');
    expect(within(grid).getByText('MTA24')).toBeVisible();
    expect(screen.queryByText(/Rows per page/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 - 10 of/u)).not.toBeInTheDocument();
    const frame = screen.getByRole('toolbar', { name: 'File' });
    expect(within(frame).getByRole('button', { name: 'Download' })).toBeEnabled();
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
      const toolbar = document.querySelector('[data-slot="frame-bar"]') as HTMLElement;
      expect(within(toolbar).getByLabelText('Location')).toHaveTextContent(name);
      const source = screen.queryByRole('tab', { name: 'Source' });
      if (source) await userEvent.click(source);
      expect(document.querySelector('pre')).toHaveTextContent(content);
      expect(screen.getByRole('button', { name: 'Copy contents' })).toBeVisible();
      expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
    },
  );

  it.each(['cat.html', 'cat.HTM', 'unlabelled.txt'])(
    'opens HTML %s in the shared browser by its path and shows its exact source',
    async (path) => {
      repository.readWorkspaceFile.mockResolvedValue('<h1>Pedal!</h1>');
      repository.openBrowserFile.mockResolvedValue({ id: 'p7', title: 'Pedal', url: '', host: '' });
      const shown: unknown[] = [];
      const listen = (event: Event) => shown.push((event as CustomEvent).detail);
      window.addEventListener(OPEN_BROWSER_PAGE_EVENT, listen);
      renderFile(
        <MemoryRouter initialEntries={['/workspaces/workspace_1/sessions/sess_1']}>
          <Routes>
            <Route
              element={
                <WorkspaceFileView
                  mediaType="text/html; charset=utf-8"
                  path={path}
                  size={100}
                  workspaceId="workspace_1"
                />
              }
              path="/workspaces/:workspaceId/sessions/:sessionId"
            />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(repository.openBrowserFile).toHaveBeenCalledWith('sess_1', { path }),
      );
      await waitFor(() =>
        expect(shown).toEqual([{ pageId: 'p7', sessionId: 'sess_1', label: 'Pedal' }]),
      );
      expect(document.querySelector('[data-language="html"]')).toHaveTextContent('<h1>Pedal!</h1>');
      expect(screen.queryByTitle(`HTML preview of ${path}`)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open in browser' })).toBeVisible();
      expect(repository.readWorkspaceFile).toHaveBeenCalledTimes(1);
      window.removeEventListener(OPEN_BROWSER_PAGE_EVENT, listen);
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

  it('reads a large unsized log as ranged windows with a virtualized source and its end on request', async () => {
    const lines = Array.from({ length: 30_000 }, (_, index) => `line ${index} processed`);
    repository.readWorkspaceFile.mockResolvedValue(lines.join('\n'));
    renderFile(
      <WorkspaceFileView path="run.log" mediaType="text/plain" workspaceId="workspace_1" />,
    );
    expect(await screen.findByText(/^Showing the first [\d.]+ [KM]i?B\.$/u)).toBeVisible();
    expect(repository.readWorkspaceFileRange).toHaveBeenCalledWith(
      'workspace_1',
      'run.log',
      { start: 0, end: 512 * 1024 },
      expect.anything(),
    );
    expect(repository.readWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="virtual-source"]')).toBeInTheDocument();
    expect(document.querySelector('pre')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show end' }));
    expect(await screen.findByText(/^Showing the last [\d.]+ [KM]i?B\.$/u)).toBeVisible();
    expect(repository.readWorkspaceFileRange).toHaveBeenCalledWith(
      'workspace_1',
      'run.log',
      { suffix: 512 * 1024 },
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: 'Show beginning' })).toBeVisible();
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

    expect(await screen.findByText("Couldn't read it")).toBeVisible();
    expect(screen.getByText('file not found: missing.pdf')).toBeVisible();
  });

  it('offers an image too large to read inline instead of reading it', async () => {
    renderFile(
      <WorkspaceFileView
        mediaType="image/png"
        path="figures/mosaic.png"
        size={2_254_857_830}
        workspaceId="workspace_1"
      />,
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="state-view"][data-kind="too-large"]'),
      ).toBeInTheDocument(),
    );
    expect(repository.readWorkspaceFileBytes).not.toHaveBeenCalled();
  });

  it('presents an unsupported binary as the frame no-preview state, not a code block', async () => {
    renderFile(
      <WorkspaceFileView
        mediaType="application/x-netcdf"
        path="data/run.nc"
        size={4096}
        workspaceId="workspace_1"
      />,
    );

    // The frame bar stays, with the extension and size as facts.
    const frame = screen.getByRole('toolbar', { name: 'File' });
    expect(within(frame).getByLabelText('Location')).toHaveTextContent('run.nc');
    expect(await within(frame).findByText('.nc')).toBeVisible();
    expect(within(frame).getByText('4.1 KB')).toBeVisible();
    const state = document.querySelector<HTMLElement>(
      '[data-slot="state-view"][data-kind="no-preview"]',
    )!;
    expect(state).toHaveTextContent('.nc');
    expect(state).toHaveTextContent('No preview for this format');
    // The frame bar and the state both offer the original download; Open does not repeat it.
    expect(within(state).getByRole('button', { name: 'Download' })).toBeVisible();
    expect(document.querySelector('pre code')).not.toBeInTheDocument();
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
    expect(repository.readWorkspaceFileBytes).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Open options' }));
    expect(screen.queryByRole('menuitem', { name: /^Download/u })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(frame).getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith('workspace_1', 'data/run.nc'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'File actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'File information' }));
    expect(await screen.findByText('data/run.nc')).toBeVisible();
  });

  it.each([
    ['application/x-hdf5', 'data/run.h5'],
    [undefined, 'data/scan.nxs'],
    [undefined, 'data/swath.he5'],
  ])(
    'opens HDF5 (%s, %s) in the HDF5 viewer when the service serves it, without reading the whole file',
    async (mediaType, path) => {
      repository.capabilities.mockResolvedValue({ capabilities: { x_clio_hdf5_viewer: true } });
      renderFile(
        <WorkspaceFileView
          mediaType={mediaType}
          path={path}
          size={4096}
          workspaceId="workspace_1"
        />,
      );

      expect(await screen.findByTitle(`HDF5 viewer: ${path}`)).toBeInTheDocument();
      expect(repository.readWorkspaceFileBytes).not.toHaveBeenCalled();
      expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
      repository.capabilities.mockReset();
    },
  );

  it('opens an HDF5 file as a binary file when the service has no HDF5 viewer', async () => {
    renderFile(
      <WorkspaceFileView
        mediaType="application/x-hdf5"
        path="data/run.h5"
        size={4096}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByText('run.h5')).toBeVisible();
    const state = document.querySelector<HTMLElement>(
      '[data-slot="state-view"][data-kind="no-preview"]',
    )!;
    expect(state).toHaveTextContent('.h5');
    expect(within(state).getByRole('button', { name: 'Download' })).toBeVisible();
    const frame = screen.getByRole('toolbar', { name: 'File' });
    expect(within(frame).getByRole('button', { name: 'Download' })).toBeVisible();
    expect(screen.queryByTitle('HDF5 viewer: data/run.h5')).not.toBeInTheDocument();
    expect(repository.readWorkspaceFileBytes).not.toHaveBeenCalled();
  });

  it('shows a .tex listed as a generic binary as its source, not as a binary file', async () => {
    repository.readWorkspaceFile.mockResolvedValue('\\section{Scaling}\nText.');
    renderFile(
      <WorkspaceFileView
        mediaType="application/octet-stream"
        path="paper/sections/eval.tex"
        workspaceId="workspace_1"
      />,
    );
    expect(await screen.findByText(/\\section\{Scaling\}/u)).toBeTruthy();
    expect(screen.queryByText(/No inline preview/u)).toBeNull();
  });

  it('offers to build a paper entry opened in a conversation before it is an artifact', async () => {
    repository.readWorkspaceFile.mockResolvedValue(
      '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}',
    );
    repository.commentTarget.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/sessions/sess_1']}>
          <Routes>
            <Route
              element={
                <WorkspaceFileView
                  mediaType="application/x-tex"
                  path="paper/main.tex"
                  workspaceId="workspace_1"
                />
              }
              path="/sessions/:sessionId"
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Build this paper' })).toBeTruthy();
    expect(await screen.findByText(/\\documentclass\{article\}/u)).toBeTruthy();
    expect(repository.commentTarget).toHaveBeenCalledWith(
      'workspace_1',
      'paper/main.tex',
      expect.anything(),
    );
  });

  it('moves Build this paper into the frame’s … menu at the narrowest fold', async () => {
    const restore = narrowFrameBars();
    try {
      repository.readWorkspaceFile.mockResolvedValue(
        '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}',
      );
      repository.commentTarget.mockResolvedValue(null);
      repository.createCommentTarget.mockReturnValue(new Promise(() => {}));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/sessions/sess_1']}>
            <Routes>
              <Route
                element={
                  <WorkspaceFileView
                    mediaType="application/x-tex"
                    path="paper/main.tex"
                    workspaceId="workspace_1"
                  />
                }
                path="/sessions/:sessionId"
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      const build = await screen.findByRole('button', { name: 'Build this paper' });
      expect(build).toHaveAttribute('data-frame-tool');
      await waitFor(() => expect(build).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: 'File actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Build this paper' }));
      expect(repository.createCommentTarget).toHaveBeenCalledWith('workspace_1', {
        path: 'paper/main.tex',
        session_id: 'sess_1',
      });
    } finally {
      restore();
    }
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
