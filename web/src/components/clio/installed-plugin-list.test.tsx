import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { pluginEntrySchema } from '@clio/core/v3';
import { InstalledPluginList } from './installed-plugin-list';

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
it('keeps pack members and descriptions behind compact disclosures', async () => {
  render(<InstalledPluginList plugins={plugins} pending={false} />);
  const user = userEvent.setup();
  expect(screen.queryByText('pdf')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'documents Pack' }));
  expect(screen.getByText('pdf')).toBeVisible();
  expect(screen.queryByText('Read PDF documents')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'pdf' }));
  expect(screen.getByText('Read PDF documents')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Explore pdf' })).toBeVisible();
});
it('reveals a matching member when filtering and keeps marketplace groups collapsible', async () => {
  render(<InstalledPluginList plugins={plugins} pending={false} />);
  await userEvent.type(screen.getByRole('textbox', { name: 'Filter plugins' }), 'pdf');
  expect(screen.getByText('Read PDF documents')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'clio 2' }));
  expect(screen.queryByText('Read PDF documents')).toBeNull();
});
it('keeps a pending trust action available without expanding the plugin', async () => {
  const trust = vi.fn();
  render(
    <InstalledPluginList
      plugins={[{ ...plugins[1]!, pending_trust: true }]}
      pending={false}
      onTrustUpdate={trust}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Trust the update of pdf' }));
  expect(trust).toHaveBeenCalledWith('clio');
  expect(screen.queryByText('Read PDF documents')).toBeNull();
});
