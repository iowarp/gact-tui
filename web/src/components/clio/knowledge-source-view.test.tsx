import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerComposerReferenceTarget } from '@/lib/composer-reference-requests';
import { KnowledgeSourceView } from './knowledge-source-view';
import { WorkbenchTabListProvider } from './workbench-tab-list';

const repository = vi.hoisted(() => ({
  knowledgeSnapshot: vi.fn(),
  knowledgeGraph: vi.fn(),
  connectedSources: vi.fn(),
  knowledgeOpen: vi.fn(),
  knowledgeSync: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://test' } }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('./knowledge-graph', () => ({
  KnowledgeGraph: ({
    snapshot,
    onSelect,
  }: {
    snapshot: { notes: { path: string }[] };
    onSelect: (path: string) => void;
  }) => (
    <div aria-label="Test graph">
      {snapshot.notes.map((note) => (
        <button key={note.path} onClick={() => onSelect(note.path)}>
          Graph {note.path}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./file-source-view', () => ({
  FileSourceView: ({ content, label }: { content: string; label: string }) => (
    <pre aria-label={label}>{content}</pre>
  ),
}));
vi.mock('./workspace-resource-view', () => ({
  WorkspaceResourceCarousel: () => <p>Attachment preview</p>,
}));

let host: HTMLElement;
afterEach(() => {
  cleanup();
  host?.remove();
});

beforeEach(() => {
  vi.resetAllMocks();
  repository.connectedSources.mockResolvedValue([
    {
      id: 'vault',
      label: 'Opal vault',
      source_kind: 'knowledge',
      connection: 'local_vault',
      link_access: 'read_only',
      root: '/vaults/opal',
    },
  ]);
  repository.knowledgeSnapshot.mockResolvedValue({
    source_id: 'vault',
    revision: 'index1',
    state: 'ready',
    total: 2,
    offset: 0,
    next_offset: null,
    truncated: false,
    warnings: [],
    notes: [
      { path: 'a.md', title: 'Alpha', kind: 'note', revision: 'a1' },
      { path: 'b.md', title: 'Beta', kind: 'note', revision: 'b1' },
    ],
    links: [
      { source: 'a.md', target: 'b.md', status: 'resolved', kind: 'link', selector: 'Topic' },
    ],
  });
  repository.knowledgeOpen.mockImplementation((_wid: string, _sid: string, path: string) =>
    Promise.resolve({
      source_id: 'vault',
      note: { path, title: path === 'a.md' ? 'Alpha' : 'Beta', kind: 'note', revision: 'notehash' },
      text: `Content of ${path}`,
      properties: {},
      links: [
        { source: 'a.md', target: 'b.md', status: 'resolved', kind: 'link', selector: 'Topic' },
      ],
      resource: {
        id: `resource:${path}`,
        workspace_id: 'w',
        name: path,
        revision: 1,
        detected_mime: 'text/markdown',
      },
      access: 'read_only',
      link_revision: 'link1',
    }),
  );
  repository.knowledgeGraph.mockImplementation((...args: unknown[]) =>
    repository.knowledgeSnapshot(...args),
  );
});

function renderView() {
  host = document.createElement('div');
  document.body.append(host);
  const picked = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkbenchTabListProvider
        slot={{
          host,
          title: 'Vault',
          shown: true,
          claim: () => () => {},
          setShown: vi.fn(),
          picked,
        }}
      >
        <KnowledgeSourceView workspaceId="w" sourceId="vault" />
      </WorkbenchTabListProvider>
    </QueryClientProvider>,
  );
  return { picked, frame: screen.getByRole('toolbar', { name: 'Vault actions' }) };
}

async function chooseMore(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: new RegExp(`^${name}`) }));
}

it.each([true, false])(
  'explains an empty vault according to its actual edit permission (%s)',
  async (writable) => {
    repository.connectedSources.mockResolvedValue([
      {
        id: 'vault',
        label: 'Opal vault',
        connection: 'local_vault',
        capabilities: { note_write: writable },
        link_access: writable ? 'write_through' : 'read_only',
      },
    ]);
    repository.knowledgeSnapshot.mockResolvedValue({
      source_id: 'vault',
      revision: 'empty',
      total: 0,
      notes: [],
      links: [],
      warnings: [],
    });
    renderView();
    expect(await screen.findByText('Your vault is ready')).toBeVisible();
    expect(
      await screen.findByText(
        writable ? /to create notes in this vault/ : /This connection is read only/,
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Test graph')).not.toBeInTheDocument();
  },
);

it('frames the vault with its counts, views and list, without a header of its own', async () => {
  const { frame } = renderView();
  expect(await within(frame).findByText('2 notes')).toBeInTheDocument();
  expect(within(frame).getByText('1 link')).toBeInTheDocument();
  expect(within(frame).getByText('vault')).toBeInTheDocument();
  expect(await within(frame).findByText('Opal vault')).toBeInTheDocument();
  const views = within(frame).getByRole('tablist', { name: 'Vault views' });
  expect(within(views).getByRole('tab', { name: 'Note graph' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(within(views).getByRole('tab', { name: 'Note' })).toBeInTheDocument();
  expect(within(views).getByRole('tab', { name: 'Markdown' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Files' })).not.toBeInTheDocument();
  expect(await screen.findByLabelText('Test graph')).toBeInTheDocument();
  const list = within(host).getByRole('list', { name: 'Vault files' });
  expect(within(list).getByRole('button', { name: 'Alpha, 1 link' })).toBeInTheDocument();
  expect(repository.knowledgeGraph.mock.calls[0][2]).toEqual({
    query: '',
    focus: '',
    attachments: false,
  });
  expect(repository.knowledgeSnapshot).toHaveBeenCalledWith(
    'w',
    'vault',
    { query: '', focus: '', offset: 0 },
    expect.anything(),
  );
  expect(within(host).queryByRole('button', { name: 'Previous notes' })).not.toBeInTheDocument();
});

it('shares one selection across graph, list and note, follows links and adds the note to a message', async () => {
  const { frame, picked } = renderView();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Graph a.md' }));
  expect(screen.getByLabelText('Test graph')).toBeInTheDocument();
  expect(within(host).getByRole('button', { name: 'Alpha, 1 link' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(within(frame).getByRole('tab', { name: 'Note' }));
  expect(await screen.findByText('Content of a.md')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Links to .+, Topic$/ }));
  expect(await screen.findByText('Content of b.md')).toBeInTheDocument();
  expect(within(host).getByRole('button', { name: 'Beta, 1 link' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(within(frame).getByText('Beta')).toBeInTheDocument();
  await user.click(within(frame).getByRole('tab', { name: 'Markdown' }));
  expect(screen.getByLabelText('Markdown of Beta')).toHaveTextContent('Content of b.md');

  const target = { workspaceId: 'w', add: vi.fn() };
  const unregister = registerComposerReferenceTarget(target);
  try {
    const add = within(frame).getByRole('button', { name: 'Add to message' });
    await waitFor(() => expect(add).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(add);
    expect(target.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resource', id: 'resource:b.md', revision: '1' }),
    );
  } finally {
    unregister();
  }

  await user.click(within(frame).getByRole('tab', { name: 'Note graph' }));
  await user.click(within(host).getByRole('button', { name: 'Alpha, 1 link' }));
  expect(picked).toHaveBeenCalledOnce();
  expect(within(frame).getByRole('tab', { name: 'Note' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByText('Content of a.md')).toBeInTheDocument();
  await chooseMore('Show its linked notes');
  await waitFor(() =>
    expect(repository.knowledgeGraph.mock.calls.at(-1)?.[2]).toMatchObject({ focus: 'a.md' }),
  );
}, 15_000);

it('renders wiki links as note links and keeps the link list compact', async () => {
  const backlinks = Array.from({ length: 6 }, (_, index) => ({
    source: `notes/n${index}.md`,
    target: 'a.md',
    status: 'resolved',
    kind: 'link',
  }));
  repository.knowledgeOpen.mockImplementation((_wid: string, _sid: string, path: string) =>
    Promise.resolve({
      source_id: 'vault',
      note: { path, title: path === 'a.md' ? 'Alpha' : 'Beta', kind: 'note', revision: 'n' },
      text:
        path === 'a.md'
          ? 'See [[b]] and [[Gamma|the gamma note]], not `[[b]]` in code.'
          : `Content of ${path}`,
      properties: {},
      links:
        path === 'a.md'
          ? [{ source: 'a.md', target: 'b.md', status: 'resolved', kind: 'link' }, ...backlinks]
          : [],
      resource: { id: `resource:${path}`, workspace_id: 'w', name: path, revision: 1 },
      access: 'read_only',
      link_revision: 'link1',
    }),
  );
  const { frame } = renderView();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Graph a.md' }));
  await user.click(within(frame).getByRole('tab', { name: 'Note' }));
  const wiki = await screen.findByRole('link', { name: 'b' });
  expect(wiki).toHaveAttribute('title', 'b.md');
  const missing = screen.getByText('the gamma note');
  expect(missing).toHaveAttribute('title', 'Not in this vault');
  expect(missing.closest('a')).toBeNull();
  expect(screen.getByText('[[b]]').tagName).toBe('CODE');

  const links = screen.getByRole('region', { name: 'Links 1 Backlinks 6' });
  expect(within(links).getAllByRole('listitem')).toHaveLength(5);
  expect(within(links).getByRole('button', { name: 'Linked from n0' })).toBeInTheDocument();
  expect(within(links).getByText('n0')).toHaveAttribute('title', 'notes/n0.md');
  await user.click(within(links).getByRole('button', { name: '2 more' }));
  expect(within(links).getAllByRole('listitem')).toHaveLength(7);

  await user.click(wiki);
  expect(await screen.findByText('Content of b.md')).toBeInTheDocument();
}, 15_000);

it('shows reader failures without fabricating note contents', async () => {
  repository.knowledgeOpen.mockRejectedValue(new Error('Source disconnected'));
  const { frame } = renderView();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Graph a.md' }));
  await user.click(within(frame).getByRole('tab', { name: 'Note' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Source disconnected');
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

it('recovers source information and the note after a service reconnect', async () => {
  repository.connectedSources.mockRejectedValueOnce(new Error('Service disconnected'));
  const { frame } = renderView();
  const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Service disconnected');
  await user.click(screen.getByRole('button', { name: 'Graph a.md' }));
  await user.click(within(frame).getByRole('tab', { name: 'Note' }));
  expect(await screen.findByText('Content of a.md')).toBeInTheDocument();
  await chooseMore('Refresh');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('Content of a.md')).toBeInTheDocument();
});
