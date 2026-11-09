import { pluginEntrySchema } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InstalledPluginList } from './installed-plugin-list';

vi.mock('./plugin-explorer', () => ({
  PluginExplorer: ({ reference }: { reference: string }) => (
    <div aria-label={reference} role="dialog" />
  ),
}));

const plugins = [
  pluginEntrySchema.parse({
    id: 'documents',
    ref: 'clio/documents',
    marketplace: 'clio',
    kind: 'pack',
    members: ['pdf'],
    trusted: true,
  }),
  pluginEntrySchema.parse({
    id: 'pdf',
    ref: 'clio/pdf',
    marketplace: 'clio',
    description: 'Read PDF documents',
    trusted: true,
    skills: ['read-pdf'],
  }),
];
afterEach(cleanup);

it('lists packs as single rows with what they bring, their source and a status word', () => {
  render(<InstalledPluginList plugins={plugins} pending={false} />, { wrapper: TooltipProvider });
  const list = screen.getByRole('group', { name: 'Installed plugins' });
  const rows = within(list).getAllByText(/^(documents|pdf)$/u);
  // A pack member opens from its pack, so it is not a second root row.
  expect(rows.map((row) => row.textContent)).toEqual(['documents']);
  expect(within(list).getByText('Pack')).toBeVisible();
  expect(within(list).getByText('1 plugin')).toBeVisible();
  expect(within(list).getByText('Trusted')).toBeVisible();
});

it('explores a plugin beside the list, or in a dialog without a pane', async () => {
  const user = userEvent.setup();
  const onExplore = vi.fn();
  const { unmount } = render(
    <InstalledPluginList
      onExplore={onExplore}
      pending={false}
      plugins={[plugins[1]!]}
      selected="clio/pdf"
    />,
    { wrapper: TooltipProvider },
  );
  const explore = screen.getByRole('button', { name: 'Explore pdf' });
  expect(explore).toHaveAttribute('aria-pressed', 'true');
  await user.click(explore);
  expect(onExplore).toHaveBeenCalledWith(plugins[1]);
  unmount();
  render(<InstalledPluginList pending={false} plugins={[plugins[1]!]} />, {
    wrapper: TooltipProvider,
  });
  await user.click(screen.getByRole('button', { name: 'Explore pdf' }));
  expect(screen.getByRole('dialog', { name: 'clio/pdf' })).toBeInTheDocument();
});

it('names a waiting update in words on the row', () => {
  render(
    <InstalledPluginList pending={false} plugins={[{ ...plugins[1]!, pending_trust: true }]} />,
    { wrapper: TooltipProvider },
  );
  expect(screen.getByText('Update waits for trust')).toBeVisible();
});

it('shows loading, failure and empty as one line each', () => {
  const { rerender } = render(<InstalledPluginList pending plugins={[]} />, {
    wrapper: TooltipProvider,
  });
  expect(screen.getByText('Loading plugins…')).toBeInTheDocument();
  rerender(<InstalledPluginList error="offline" pending={false} plugins={[]} />);
  expect(screen.getByText('Plugins could not be listed: offline')).toBeInTheDocument();
  rerender(<InstalledPluginList pending={false} plugins={[]} />);
  expect(screen.getByText('No plugins')).toBeInTheDocument();
});
