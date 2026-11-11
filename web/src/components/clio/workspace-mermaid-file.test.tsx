import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceFileView } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileBytes: vi.fn(),
    readWorkspaceFileRange: vi.fn(),
    workspaceFiles: vi.fn(),
    commentTarget: vi.fn(),
    createCommentTarget: vi.fn(),
    capabilities: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
// mermaid.js is covered in mermaidcn; here only the file's route into the frame matters.
vi.mock('@/components/mermaidcn/mermaid-preview', () => ({
  MermaidPreview: ({
    chart,
    controls,
    onSvgOutputChange,
  }: {
    chart: string;
    controls: (api: {
      zoomIn: () => void;
      zoomOut: () => void;
      centerView: () => void;
      scalePercent: number;
    }) => ReactNode;
    onSvgOutputChange: (svg: string) => void;
  }) => {
    useEffect(
      () => onSvgOutputChange('<svg viewBox="0 0 10 10"></svg>'),
      [chart, onSvgOutputChange],
    );
    const api = { zoomIn: () => {}, zoomOut: () => {}, centerView: () => {}, scalePercent: 100 };
    return <div data-slot="mermaid-preview">{controls(api)}</div>;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SOURCE = 'flowchart LR\n  fetch --> clean --> plot\n';

describe('a Mermaid workspace file', () => {
  it.each(['diagrams/pipeline.mmd', 'diagrams/pipeline.mermaid'])(
    'opens %s listed as octet-stream as its framed diagram, not the binary card',
    async (path) => {
      repository.readWorkspaceFile.mockResolvedValue(SOURCE);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <WorkspaceFileView
            mediaType="application/octet-stream"
            path={path}
            size={SOURCE.length}
            workspaceId="workspace_1"
          />
        </QueryClientProvider>,
      );

      const name = path.split('/').at(-1)!;
      const diagram = await screen.findByRole('region', { name });
      expect(diagram).toHaveAttribute('data-slot', 'mermaid-diagram');
      expect(screen.queryByText(/No inline preview/u)).not.toBeInTheDocument();

      const toolbar = document.querySelector('[data-slot="frame-bar"]') as HTMLElement;
      expect(within(toolbar).getByRole('tab', { name: 'Diagram' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // The viewer body offers the selection menu with the file's path.
      expect(diagram.closest('[data-selection-surface="file"]')).toHaveAttribute(
        'data-file-path',
        path,
      );

      await userEvent.click(within(toolbar).getByRole('tab', { name: 'Source' }));
      expect(document.querySelector('pre')).toHaveTextContent('fetch --> clean --> plot');
    },
  );
});
