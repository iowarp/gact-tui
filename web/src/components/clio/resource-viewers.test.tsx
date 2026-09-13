import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactView, BlueprintFileEditor } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readAgentBlueprintFile: vi.fn(),
    readArtifactTextFor: vi.fn(),
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

    const heading = await screen.findByRole('heading', { name: 'HDF5 report' });
    expect(heading.closest('article')).toHaveClass('min-w-0');
    expect(document.querySelector('[data-language="markdown"]')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('# HDF5 report');
  });
});
