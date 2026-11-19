import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CadFileView } from './cad-file-view';
import { WorkspaceFileView } from './resource-viewers';

const { repository } = vi.hoisted(() => ({
  repository: {
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileBytes: vi.fn(),
    readWorkspaceFileRange: vi.fn(),
    commentTarget: vi.fn(),
    capabilities: vi.fn(async () => ({ capabilities: {} })),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./cad-file-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cad-file-view')>()),
  WorkspaceCadView: ({ path, format }: { path: string; format: string }) => (
    <div aria-label={`3D ${format} ${path}`} />
  ),
}));

function renderView(view: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{view}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CAD files in the file viewer', () => {
  it.each([
    ['print/whistle.step', 'text/plain', 'step'],
    ['print/whistle-body.stl', 'application/octet-stream', 'stl'],
    ['print/plate.3mf', 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', '3mf'],
  ])('opens %s (listed as %s) in the 3D view', async (path, mediaType, format) => {
    renderView(<WorkspaceFileView mediaType={mediaType} path={path} size={2048} workspaceId="w" />);
    expect(await screen.findByLabelText(`3D ${format} ${path}`)).toBeInTheDocument();
    expect(repository.readWorkspaceFile).not.toHaveBeenCalled();
  });

  it('offers a CAD file past the inline limit instead of reading it', async () => {
    renderView(<WorkspaceFileView path="huge.stl" size={500 * 1024 * 1024} workspaceId="w" />);
    expect(await screen.findByText(/too large/iu)).toBeInTheDocument();
    expect(screen.queryByLabelText('3D stl huge.stl')).not.toBeInTheDocument();
  });

  it('says why it cannot draw the model where WebGL is unavailable', () => {
    // jsdom has no WebGL context.
    renderView(
      <CadFileView
        bytes={new Uint8Array(84)}
        format="stl"
        name="body.stl"
        source={{ kind: 'workspace', workspaceId: 'w', path: 'body.stl', mediaType: 'model/stl' }}
      />,
    );
    expect(screen.getByText('3D view needs WebGL')).toBeInTheDocument();
  });
});
