import type { TransportFrame } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EyeIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientFileViewHost, useClientFileView } from './client-file-view';
import { dispatchFileViewLookFrame, FileViewLooks, fileViewId } from './file-view-look';
import { FileViewerShell } from './file-viewer-shell';

const { repository } = vi.hoisted(() => ({
  repository: {
    readWorkspaceFileBytes: vi.fn(async () => new Uint8Array()),
    setFileViewShown: vi.fn(async () => ({ shown: true })),
    postFileViewLook: vi.fn(async () => ({})),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PATH = 'out/whistle_assembly.step';
const STATE = ['Camera: looking from the front (camera on the −Y side)', 'Selected part: plug'];

/** A renderer that draws in the browser and declares itself, as the CAD view does. */
function DeclaringView() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const declaration = useMemo(
    () => (root ? { kind: '3D model', root, state: () => STATE, stateKey: 'one' } : undefined),
    [root],
  );
  useClientFileView(declaration);
  return (
    <div className="relative" ref={setRoot}>
      model
    </div>
  );
}

function renderFile(url: string, content = <DeclaringView />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const frame = (
    <FileViewerShell
      source={{ kind: 'workspace', workspaceId: 'w1', path: PATH, mediaType: '', size: 10 }}
      tabs={[
        {
          value: 'preview',
          label: 'Preview',
          icon: EyeIcon,
          content: (
            <ClientFileViewHost path={PATH} workspaceId="w1">
              {content}
            </ClientFileViewHost>
          ),
        },
      ]}
    />
  );
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={frame} path="/s/:sessionId" />
          <Route element={frame} path="/files" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function lookFrame(payload: Record<string, unknown>): TransportFrame {
  return {
    cursor: '1',
    eventName: 'file_view_look',
    receivedAt: '2026-11-14T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'file_view_look',
      occurred_at: '2026-11-14T00:00:00Z',
      scope: { connection_id: 'local', session_id: 'sess_1' },
      payload,
    },
  };
}

describe('client-rendered file views', () => {
  it('turns on the Comments control and offers the view and its state to the agent', async () => {
    const { container } = renderFile('/s/sess_1');
    const comments = within(container).getByRole('button', { name: 'Comments' });
    expect(comments).not.toHaveAccessibleDescription('Not available for this format');
    expect(comments).toBeEnabled();
    const viewId = fileViewId('w1', PATH);
    await waitFor(() =>
      expect(repository.setFileViewShown).toHaveBeenCalledWith('sess_1', viewId, {
        holder: expect.any(String),
        shown: true,
        file: { workspace_id: 'w1', path: PATH, name: 'whistle_assembly.step', kind: '3D model' },
        state: STATE,
      }),
    );
    await userEvent.setup().click(comments);
    expect(comments).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByLabelText('Drag over the view to mark a region, or click a point'),
    ).toBeInTheDocument();

    // jsdom lays nothing out, so the look is answered honestly with the typed reason.
    dispatchFileViewLookFrame(
      lookFrame({ session_id: 'sess_1', view_id: viewId, call_id: 'look_1', max_side: 1568 }),
    );
    await waitFor(() =>
      expect(repository.postFileViewLook).toHaveBeenCalledWith('sess_1', viewId, 'look_1', {
        error: { reason: 'view_not_laid_out', message: 'The view has no size on screen.' },
      }),
    );
    cleanup();
    expect(repository.setFileViewShown).toHaveBeenLastCalledWith('sess_1', viewId, {
      holder: expect.any(String),
      shown: false,
    });
  });

  it('says why a file view outside a conversation takes no comments', () => {
    const { container } = renderFile('/files');
    expect(within(container).getByRole('button', { name: 'Comments' })).toHaveAccessibleDescription(
      'Open a conversation to comment',
    );
    expect(repository.setFileViewShown).not.toHaveBeenCalled();
  });

  it('leaves the frame unchanged for a renderer that does not declare itself', () => {
    const { container } = renderFile('/s/sess_1', <p>plain text</p>);
    expect(within(container).getByRole('button', { name: 'Comments' })).toHaveAccessibleDescription(
      'Not available for this format',
    );
  });

  it('answers a look with the snapshot and the state at that moment', async () => {
    const snapshot = vi.fn().mockResolvedValue({
      image: 'data:image/png;base64,AA',
      width: 900,
      height: 600,
      scale: 2,
      painted: { canvas: 1, html: 1 },
      skipped: [],
    });
    const looks = new FileViewLooks(
      repository,
      'sess_2',
      'fv_x',
      { workspace_id: 'w1', path: PATH, name: 'whistle_assembly.step', kind: '3D model' },
      snapshot,
      () => STATE,
    );
    looks.start();
    dispatchFileViewLookFrame(lookFrame({ session_id: 'sess_2', view_id: 'fv_x', call_id: 'c' }));
    await waitFor(() =>
      expect(repository.postFileViewLook).toHaveBeenCalledWith(
        'sess_2',
        'fv_x',
        'c',
        expect.objectContaining({ image: 'data:image/png;base64,AA', state: STATE }),
      ),
    );
    expect(snapshot).toHaveBeenCalledWith({ scale: 1, maxSide: 1568 });
    looks.stop();
    expect(fileViewId('w1', PATH)).toMatch(/^fv_[0-9a-f]{16}$/u);
    expect(fileViewId('w1', PATH)).not.toBe(fileViewId('w2', PATH));
  });
});
