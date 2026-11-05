import { pluginEntrySchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import './file-text-view';
import { InstalledPluginList } from './installed-plugin-list';
import { PluginExplorer } from './plugin-explorer';
const repository = vi.hoisted(() => ({
  inspectPlugin: vi.fn(),
  plugins: vi.fn(),
  capabilities: vi.fn(),
  createLocalExtension: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('browses a pack member and its source in the shared reader without changing trust', async () => {
  const user = userEvent.setup();
  const pack = pluginEntrySchema.parse({
    id: 'documents',
    ref: 'clio/documents',
    kind: 'pack',
    marketplace: 'clio',
    trusted: true,
    members: ['pdf'],
  });
  const pdf = pluginEntrySchema.parse({
    id: 'pdf',
    ref: 'clio/pdf',
    marketplace: 'clio',
    trusted: true,
    skills: ['work-with-pdfs'],
    description: 'Read and create PDFs',
  });
  repository.plugins.mockResolvedValue({ plugins: [pack, pdf] });
  repository.capabilities.mockResolvedValue({ capabilities: { x_clio_agent_plugins: true } });
  repository.inspectPlugin.mockResolvedValue({
    plugin: pdf,
    files: [
      {
        path: 'SKILL.md',
        text: '# PDF work\nRead the source before editing.',
        bytes: 43,
        truncated: false,
        sha256: 'hash',
        error: '',
      },
    ],
    incomplete: false,
    reason: '',
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <InstalledPluginList plugins={[pack, pdf]} pending={false} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'documents Pack' }));
  const members = screen.getByRole('list', { name: 'Members of documents' });
  await user.click(within(members).getByRole('button', { name: /pdf/u }));
  await user.click(within(members).getByRole('button', { name: 'Explore pdf' }));
  const dialog = await screen.findByRole('dialog', { name: 'pdf' });
  expect(repository.inspectPlugin).toHaveBeenCalledWith('clio/pdf', false, expect.anything());
  await user.click(within(dialog).getByRole('tab', { name: 'Files (1)' }));
  // The shared reader mounts lazily when its tab opens, including its Markdown renderer.
  expect(
    await within(dialog).findByRole('heading', { name: 'PDF work' }, { timeout: 5000 }),
  ).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Copy SKILL.md' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'documents Pack' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await user.type(screen.getByRole('textbox', { name: 'Filter plugins' }), 'work-with-pdfs');
  await waitFor(() =>
    expect(screen.getByRole('list', { name: 'Members of documents' })).toBeVisible(),
  );
});

it('keeps edits after a failed save, then opens the saved local copy with truthful usage guidance', async () => {
  const user = userEvent.setup();
  const original = '---\nname: update-models\ndescription: Refresh models\n---\nOriginal guidance';
  const plugin = pluginEntrySchema.parse({
    id: 'fleet',
    ref: 'clio-builtin/fleet',
    marketplace: 'clio-builtin',
    trusted: true,
    skills: ['update-models'],
  });
  const files = [
    {
      path: 'SKILL.md',
      text: original,
      bytes: original.length,
      truncated: false,
      error: '',
      sha256: 'original',
    },
  ];
  repository.plugins.mockResolvedValue({ plugins: [plugin] });
  repository.capabilities.mockResolvedValue({
    capabilities: { x_clio_agent_plugins: true, x_clio_extension_library: true },
  });
  repository.inspectPlugin.mockImplementation(async (ref: string) => ({
    plugin: ref.startsWith('private-local/')
      ? { ...plugin, ref, id: 'my-models', marketplace: 'private-local' }
      : plugin,
    files,
    incomplete: false,
    reason: '',
  }));
  repository.createLocalExtension
    .mockRejectedValueOnce(new Error('That name already exists'))
    .mockResolvedValue({ marketplace: 'private-local', plugins: ['my-models'] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <PluginExplorer reference={plugin.ref} initialSkill="update-models" onClose={vi.fn()} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'Edit a local copy' }));
  const editor = screen.getByRole('textbox', { name: 'Edit SKILL.md' });
  await user.type(editor, '\nLocal instruction');
  expect(screen.getByText(/source repository and current agent stay unchanged/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'File actions' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save local copy' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('That name already exists');
  expect(editor).toHaveValue(`${original}\nLocal instruction`);
  const name = screen.getByRole('textbox', { name: 'New local copy name' });
  await user.clear(name);
  await user.type(name, 'my-models');
  await user.click(screen.getByRole('button', { name: 'Save local copy' }));
  await waitFor(() =>
    expect(repository.createLocalExtension).toHaveBeenLastCalledWith({
      name: 'my-models',
      files: { 'SKILL.md': `${original}\nLocal instruction` },
    }),
  );
  expect(await screen.findByText('private-local/my-models')).toBeVisible();
  await user.click(screen.getByText('Use this copy in an agent'));
  expect(screen.getByText(/Duplicate skill names are rejected/)).toHaveTextContent(
    'does not override it',
  );
  await waitFor(() =>
    expect(repository.inspectPlugin).toHaveBeenCalledWith(
      'private-local/my-models',
      false,
      expect.anything(),
      'update-models',
    ),
  );
});
