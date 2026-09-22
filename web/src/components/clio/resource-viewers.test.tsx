import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactView, BlueprintFileEditor, WorkspaceFileView } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readAgentBlueprintFile: vi.fn(),
    readArtifactBytesFor: vi.fn(),
    readArtifactTextFor: vi.fn(),
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileBytes: vi.fn(),
    writeAgentBlueprintFile: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
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
  ClioDocumentPdfViewer: ({ name, source }: { name: string; source: { url: string } }) => (
    <div aria-label={`PDF ${name}`}>{source.url}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BlueprintFileEditor', () => {
  it('persists an edited blueprint file through the connected repository', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readAgentBlueprintFile.mockResolvedValue('title: Operator');
    repository.writeAgentBlueprintFile.mockResolvedValue({
      entry: { path: 'experts/operator.md', type: 'file', size: 22 },
      validation_errors: [],
      validation_warnings: [],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BlueprintFileEditor
          blueprintId="operator"
          path="experts/operator.md"
          sessionId="session_1"
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    const editor = await screen.findByRole('textbox', {
      name: 'Blueprint source experts/operator.md',
    });
    await screen.findByText('Source is saved.');
    fireEvent.change(editor, { target: { value: 'title: Cluster Operator' } });
    await screen.findByText('Unsaved');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(repository.writeAgentBlueprintFile).toHaveBeenCalledWith(
      'operator',
      'experts/operator.md',
      'title: Cluster Operator',
      { workspaceId: 'workspace_1', sessionId: 'session_1' },
    );
    expect(await screen.findByText('Source is saved.')).toBeVisible();
  });
});

describe('ArtifactView', () => {
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

    expect(await screen.findByLabelText('Zoomable image scan-speed.svg')).toBeVisible();
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
  });
});

describe('WorkspaceFileView', () => {
  function renderFile(view: ReactNode) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}>{view}</QueryClientProvider>);
  }

  it('routes a remote PDF to PDF.js by media type without downloading it as text', async () => {
    renderFile(
      <WorkspaceFileView
        mediaType="application/pdf"
        path="reports/remote paper.pdf"
        size={50_000_000}
        workspaceId="workspace_1"
      />,
    );

    const viewer = await screen.findByLabelText('PDF remote paper.pdf');
    expect(viewer).toHaveTextContent(
      'http://127.0.0.1:8790/v1/workspaces/workspace_1/files/read?path=reports%2Fremote%20paper.pdf',
    );
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
    expect(repository.readWorkspaceFileBytes).not.toHaveBeenCalled();
  });

  it('presents unsupported binary metadata and controls instead of a code block', () => {
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
    expect(screen.getByRole('button', { name: 'Download' })).toBeVisible();
    expect(document.querySelector('pre code')).not.toBeInTheDocument();
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
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
