import { pluginEntrySchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import './file-text-view';
import { InstalledPluginList } from './installed-plugin-list';
const repository = vi.hoisted(() => ({
  inspectPlugin: vi.fn(),
  plugins: vi.fn(),
  capabilities: vi.fn(),
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
  await user.click(screen.getByRole('button', { name: 'Expand pack documents' }));
  const members = screen.getByRole('list', { name: 'Members of documents' });
  await user.click(within(members).getByRole('button', { name: /pdf/u }));
  const dialog = await screen.findByRole('dialog', { name: 'pdf' });
  expect(repository.inspectPlugin).toHaveBeenCalledWith('clio/pdf', false, expect.anything());
  await user.click(within(dialog).getByRole('tab', { name: 'Files (1)' }));
  // The shared reader mounts lazily when its tab opens, including its Markdown renderer.
  expect(
    await within(dialog).findByRole('heading', { name: 'PDF work' }, { timeout: 5000 }),
  ).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Copy SKILL.md' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Collapse pack documents' })).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Filter plugins' }), 'work-with-pdfs');
  await waitFor(() =>
    expect(screen.getByRole('list', { name: 'Members of documents' })).toBeVisible(),
  );
});
