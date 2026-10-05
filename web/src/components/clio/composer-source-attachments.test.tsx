import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer } from './composer';

const repository = vi.hoisted(() => ({
  connectedSources: vi.fn(),
  storageProviders: vi.fn(),
  hostStorageSettings: vi.fn(),
  sourceOperations: vi.fn(),
  sourceMappingOptions: vi.fn(),
  browseConnectedSource: vi.fn(),
  beginSourceDraft: vi.fn(),
  finishSourceDraft: vi.fn(),
  linkConnectedSource: vi.fn(),
  transferConnectedSource: vi.fn(),
  attachSourceFolder: vi.fn(),
  attachSourceFile: vi.fn(),
  workspaceReferences: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const source = {
  id: 'source_inputs',
  label: 'Research inputs',
  provider: 'local',
  root: '/inputs',
  owner: { clio_id: 'one', host_id: 'local' },
  mode: 'read_only',
  connected: true,
  authenticated: true,
  materialization: 'not_materialized',
  local_path: null,
  link_available: true,
  linked: false,
  download_available: true,
  configuration: {},
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
};
const resource = {
  id: 'res_folder',
  name: 'folder-index.json',
  revision: 1,
  detected_mime: 'application/json',
};
const running = {
  id: 'download_1',
  state: 'running',
  created_at: '2026-10-04',
  bytes_done: 0,
  bytes_total: 14,
};
beforeEach(() => {
  vi.resetAllMocks();
  repository.connectedSources.mockResolvedValue([source]);
  repository.storageProviders.mockResolvedValue({ providers: [] });
  repository.hostStorageSettings.mockResolvedValue({ hostname: 'DESKTOP', effective: {} });
  repository.sourceOperations.mockResolvedValue([]);
  repository.sourceMappingOptions.mockResolvedValue({
    link_access: ['read_only', 'publish_later', 'write_through'],
    write_permission: true,
    reason: 'File permissions are checked when publishing.',
  });
  repository.browseConnectedSource.mockResolvedValue({ entries: [], next_offset: null });
  repository.beginSourceDraft.mockResolvedValue({ id: 'draft_test' });
  repository.finishSourceDraft.mockResolvedValue({ finished: true });
  repository.attachSourceFolder.mockResolvedValue(resource);
  repository.workspaceReferences.mockResolvedValue([]);
  repository.transferConnectedSource.mockImplementation(async () => {
    repository.sourceOperations.mockResolvedValue([running]);
    return running;
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});
afterEach(cleanup);

function renderComposer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={client}>
      <PromptInputProvider>
        <ClioComposer
          attachments
          contextReferences
          workspaceId="w"
          state="completed"
          provider="codex"
          model="gpt-5.6-luna"
          onSubmit={onSubmit}
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
  return { client, onSubmit, user: userEvent.setup() };
}

async function openSource(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add context' }));
  await user.click(screen.getByRole('menuitem', { name: 'Attach' }));
  await user.click(await screen.findByRole('button', { name: 'Your sources' }));
  await user.click(screen.getByRole('button', { name: /^Research inputs/ }));
}

describe('source attachments in the composer', () => {
  it('releases the draft when creating the linked-folder receipt fails', async () => {
    repository.attachSourceFolder.mockRejectedValueOnce(new Error('Folder unavailable'));
    const { user } = renderComposer();
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Link folder' }));
    await waitFor(() =>
      expect(repository.finishSourceDraft).toHaveBeenCalledWith(
        'w',
        source.id,
        'draft_test',
        false,
      ),
    );
    expect(screen.queryByRole('group', { name: 'Attached sources' })).toBeNull();
  });

  it('withdraws the server draft when a linked folder is removed before sending', async () => {
    const { user, onSubmit } = renderComposer();
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Link folder' }));
    await user.click(
      await screen.findByRole('button', { name: 'Remove attachment Research inputs' }),
    );
    await waitFor(() =>
      expect(repository.finishSourceDraft).toHaveBeenCalledWith(
        'w',
        source.id,
        'draft_test',
        false,
      ),
    );
    expect(screen.queryByRole('group', { name: 'Attached sources' })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves a failed-send attachment until the user explicitly removes it', async () => {
    const { user, onSubmit } = renderComposer();
    onSubmit.mockRejectedValueOnce(new Error('Message rejected'));
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Link folder' }));
    await screen.findByRole('group', { name: 'Attached sources' });
    await user.type(
      screen.getByRole('combobox', { name: /investigate, build, explain, or act/ }),
      'Inspect this{Enter}',
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(repository.finishSourceDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Attached sources' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove attachment Research inputs' }));
    await waitFor(() =>
      expect(repository.finishSourceDraft).toHaveBeenCalledWith(
        'w',
        source.id,
        'draft_test',
        false,
      ),
    );
  });

  it('reopens an attached subfolder for browsing without downloading or refreshing it', async () => {
    repository.connectedSources.mockResolvedValue([{ ...source, linked: true }]);
    repository.browseConnectedSource.mockResolvedValue({
      entries: [{ path: 'nested', kind: 'directory' }],
      next_offset: null,
    });
    const { user } = renderComposer();
    await openSource(user);
    await user.click(await screen.findByRole('button', { name: 'nested' }));
    await user.click(screen.getByRole('button', { name: 'Add this folder to message' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open attached folder Research inputs / nested' }),
    );
    expect(await screen.findByRole('button', { name: 'Source / nested' })).toBeVisible();
    expect(repository.browseConnectedSource).toHaveBeenLastCalledWith(
      'w',
      source.id,
      expect.objectContaining({ folder: 'nested', materialized: false }),
      expect.any(AbortSignal),
    );
    expect(repository.transferConnectedSource).not.toHaveBeenCalled();
    expect(repository.linkConnectedSource).not.toHaveBeenCalled();
  });

  it('downloads a selected file using the transfer capability and adds only that file to the message', async () => {
    repository.browseConnectedSource.mockResolvedValue({
      entries: [{ path: 'data.csv', kind: 'file', size: 14 }],
      next_offset: null,
    });
    repository.attachSourceFile.mockResolvedValue({
      ...resource,
      id: 'res_file',
      name: 'data.csv',
      detected_mime: 'text/csv',
    });
    const { user, client, onSubmit } = renderComposer();
    await openSource(user);
    await user.click(await screen.findByRole('button', { name: 'Download file' }));
    expect(await screen.findByRole('group', { name: 'Downloading attachments' })).toHaveTextContent(
      'Research inputs / data.csv',
    );
    expect(repository.transferConnectedSource).toHaveBeenCalledWith(
      'w',
      source.id,
      ['data.csv'],
      'draft_test',
      'editable',
    );
    repository.sourceOperations.mockResolvedValue([
      { ...running, state: 'completed', bytes_done: 14 },
    ]);
    await client.invalidateQueries();
    expect(await screen.findByRole('group', { name: 'Attached sources' })).toHaveTextContent(
      'data.csv',
    );
    expect(repository.attachSourceFile).toHaveBeenCalledWith(
      'w',
      source.id,
      'data.csv',
      false,
      'draft_test',
    );
    expect(repository.attachSourceFolder).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole('combobox', { name: /investigate, build, explain, or act/ }),
      'Read this{Enter}',
    );
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [expect.objectContaining({ resource_id: 'res_file' })],
        }),
      ),
    );
  });

  it('shows a linked folder in the attachment tray and sends its resource identity to the agent', async () => {
    const { user, onSubmit } = renderComposer();
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Link folder' }));
    const tray = await screen.findByRole('group', { name: 'Attached sources' });
    expect(within(tray).getByText('Research inputs')).toBeVisible();
    expect(within(tray).getByText('Linked folder')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();
    const editor = screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
    expect(editor).not.toHaveTextContent('Research inputs');
    await user.type(editor, 'Inspect this folder{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Inspect this folder',
          references: [
            {
              type: 'resource_ref',
              resource_id: 'res_folder',
              resource_revision: '1',
              name: 'Research inputs',
            },
          ],
        }),
      ),
    );
    expect(screen.queryByRole('group', { name: 'Attached sources' })).toBeNull();
    expect(repository.finishSourceDraft).toHaveBeenCalledWith('w', source.id, 'draft_test', true);
  });

  it('keeps a download visible after closing Attach, preserves typed text, and sends only when ready', async () => {
    const { user, client, onSubmit } = renderComposer();
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    expect(await screen.findByRole('group', { name: 'Downloading attachments' })).toHaveTextContent(
      'Research inputs',
    );
    expect(screen.queryByRole('dialog', { name: 'Attach' })).toBeNull();
    const editor = screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
    await user.type(editor, 'Inspect the download{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    repository.sourceOperations.mockResolvedValue([
      { ...running, state: 'completed', bytes_done: 14 },
    ]);
    await client.invalidateQueries();
    expect(await screen.findByRole('group', { name: 'Attached sources' })).toHaveTextContent(
      'Downloaded folder',
    );
    expect(editor).toHaveTextContent('Inspect the download');
    await user.type(editor, '{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Inspect the download',
          references: [expect.objectContaining({ resource_id: 'res_folder' })],
        }),
      ),
    );
  });

  it('does not restore a removed pending attachment when its late resource receipt arrives', async () => {
    const { user, client, onSubmit } = renderComposer();
    let finish: ((value: typeof resource) => void) | undefined;
    repository.attachSourceFolder.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await openSource(user);
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await screen.findByRole('group', { name: 'Downloading attachments' });
    repository.sourceOperations.mockResolvedValue([{ ...running, state: 'completed' }]);
    await client.invalidateQueries();
    await waitFor(() => expect(finish).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Remove attachment Research inputs' }));
    finish?.(resource);
    const editor = screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
    await user.type(editor, 'Just this text{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Just this text', references: [] }),
      ),
    );
    expect(screen.queryByRole('group', { name: 'Attached sources' })).toBeNull();
    expect(repository.finishSourceDraft).toHaveBeenCalledWith('w', source.id, 'draft_test', false);
  });
});
