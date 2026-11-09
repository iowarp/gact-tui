import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileImageIcon, TableIcon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/lib/clipboard';
import { registerComposerReferenceTarget } from '@/lib/composer-reference-requests';
import { useFileViewerActions, type FileViewerAction } from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { FileViewerShell } from './file-viewer-shell';
import { PresentationNavigation } from './presentation-navigation';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    readWorkspaceFileBytes: vi.fn(async () => new TextEncoder().encode('station,count\nMTA1,3\n')),
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const exportPng = vi.fn();
const formats: readonly FileViewerAction[] = [
  { kind: 'download', label: 'PNG image', icon: FileImageIcon, onSelect: exportPng },
];

function CountedTable() {
  useFileViewerFacts(['412 rows']);
  useFileViewerActions(formats);
  return <p>Table body</p>;
}

function renderFrame(onOpenFolder = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PresentationNavigation.Provider value={{ onOpenFolder } as never}>
        <FileViewerShell
          source={{
            kind: 'workspace',
            workspaceId: 'workspace_frame',
            path: 'results/stations.csv',
            mediaType: 'text/csv',
            size: 2048,
          }}
          tabs={[
            { value: 'data', label: 'Data', icon: TableIcon, content: <CountedTable /> },
            { value: 'source', label: 'Source', icon: TableIcon, content: <p>Source body</p> },
          ]}
        />
      </PresentationNavigation.Provider>
    </QueryClientProvider>,
  );
  return screen.getByRole('toolbar', { name: 'File' });
}

describe('file viewer frame bar', () => {
  it('shows where the file is, opening its folder in Files', async () => {
    const onOpenFolder = vi.fn();
    const frame = renderFrame(onOpenFolder);
    const location = within(frame).getByLabelText('Location');
    expect(location).toHaveTextContent('results');
    expect(location).toHaveTextContent('stations.csv');
    await userEvent.click(within(location).getByRole('button', { name: 'results' }));
    expect(onOpenFolder).toHaveBeenCalledWith('results');
  });

  it('shows one fact per mode: the renderer count, then the size in Source, and its modes as named icons', async () => {
    const user = userEvent.setup();
    const frame = renderFrame();
    expect(await within(frame).findByText('412 rows')).toBeInTheDocument();
    expect(within(frame).queryByText('2.0 KB')).not.toBeInTheDocument();
    expect(within(frame).getByRole('tab', { name: 'Data' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(frame).getByRole('tab', { name: 'Source' }));
    expect(await within(frame).findByText('2.0 KB')).toBeInTheDocument();
    expect(within(frame).queryByText('412 rows')).not.toBeInTheDocument();
  });

  it('lists the Copy variants with their keys and says why one is unavailable', async () => {
    const user = userEvent.setup();
    const frame = renderFrame();
    await user.click(within(frame).getByRole('button', { name: 'Copy options' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /^Contents/u })).toHaveAttribute(
      'data-accelerator',
      'C',
    );
    expect(within(menu).getByRole('menuitem', { name: /^Absolute path/u })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: /^Relative to workspace/u }));
    expect(copyText).toHaveBeenCalledWith('results/stations.csv');

    await user.click(within(frame).getByRole('button', { name: 'Copy options' }));
    const repo = await screen.findByRole('menuitem', { name: /^Relative to repo/u });
    expect(repo).toHaveAttribute('data-disabled');
    expect(repo).toHaveTextContent('Repository root unknown');
  });

  it('copies the contents from the Copy face', async () => {
    const frame = renderFrame();
    await userEvent.click(within(frame).getByRole('button', { name: 'Copy contents' }));
    expect(copyText).toHaveBeenCalledWith('station,count\nMTA1,3\n');
  });

  it('lists the Open variants and the renderer exports beside a visible Download', async () => {
    const user = userEvent.setup();
    const onOpenFolder = vi.fn();
    const frame = renderFrame(onOpenFolder);
    expect(within(frame).getByRole('button', { name: 'Download' })).toBeEnabled();
    await user.click(within(frame).getByRole('button', { name: 'Open options' }));
    const menu = await screen.findByRole('menu');
    const rows = within(menu)
      .getAllByRole('menuitem')
      .map((row) => [row.textContent, row.getAttribute('data-accelerator')]);
    expect(rows.map(([text]) => text)).toEqual([
      expect.stringMatching(/^In a browser tab/u),
      expect.stringMatching(/^In the system app/u),
      expect.stringMatching(/^Show in Files/u),
      expect.stringMatching(/^Export to PNG image/u),
    ]);
    expect(rows.map(([, key]) => key)).toEqual(['B', 'S', 'F', null]);
    expect(within(menu).getByRole('menuitem', { name: /^In the system app/u })).toHaveTextContent(
      'Needs the desktop app',
    );
    await user.click(within(menu).getByRole('menuitem', { name: /^Show in Files/u }));
    expect(onOpenFolder).toHaveBeenCalledWith('results');

    await user.click(within(frame).getByRole('button', { name: 'Open options' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Export to PNG image/u }));
    expect(exportPng).toHaveBeenCalledOnce();
  });

  it('adds the file to the open composer, and says why it cannot without one', async () => {
    const user = userEvent.setup();
    const frame = renderFrame();
    const add = within(frame).getByRole('button', { name: 'Add to message' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('Open a conversation to add it to a message');

    const target = { workspaceId: 'workspace_frame', add: vi.fn() };
    const unregister = registerComposerReferenceTarget(target);
    try {
      await vi.waitFor(() => expect(add).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(add);
      expect(target.add).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'workspace_file',
          id: 'results/stations.csv',
          label: 'stations.csv',
        }),
      );
    } finally {
      unregister();
    }
  });

  it('keeps the Comments icon in the frame with its reason when the format has none', () => {
    const frame = renderFrame();
    expect(within(frame).getByRole('button', { name: 'Comments' })).toHaveAccessibleDescription(
      'Not available for this format',
    );
  });
});
