import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FolderIcon } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsNavigation } from './settings-navigation';
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}
it('exposes every section in the compact menu and keeps the workspace return route', async () => {
  const user = userEvent.setup();
  const sections = [
    { id: 'plugins', label: 'Plugins & marketplaces', icon: FolderIcon },
    { id: 'appearance', label: 'Appearance', icon: FolderIcon },
  ];
  render(
    <MemoryRouter initialEntries={['/settings/plugins']}>
      <SettingsNavigation
        sections={sections}
        section="plugins"
        endpoint="http://delta"
        workspaceRoute="/workspaces/ws/sessions/sess"
      />
      <Location />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Choose settings section' }));
  expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  expect(screen.getByRole('menuitem', { name: 'Plugins & marketplaces' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  screen.getByRole('menuitem', { name: 'Appearance' }).focus();
  expect(screen.getByRole('menuitem', { name: 'Appearance' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Current route')).toHaveTextContent('"path":"/settings/appearance"');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('opens the global palette and preserves grouped navigation context', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/settings/appearance']}>
      <SettingsNavigation
        sections={[
          { id: 'appearance', label: 'Appearance', group: 'Personal', icon: FolderIcon },
          {
            id: 'data-sources',
            label: 'Data sources',
            group: 'Connections',
            keywords: 'drive github globus sign in',
            icon: FolderIcon,
          },
        ]}
        section="appearance"
        endpoint="http://delta"
        workspaceRoute="/workspaces/ws/sessions/sess"
      />
      <Location />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }));
  const opened = vi.fn();
  window.addEventListener('clio:open-command-menu', opened, { once: true });
  await user.click(screen.getByRole('button', { name: 'Search everywhere' }));
  expect(opened).toHaveBeenCalledOnce();
  expect(nav.getByRole('link', { name: 'Data sources' })).toBeVisible();
  expect(nav.getByRole('link', { name: 'Appearance' })).toBeVisible();
  await user.click(nav.getByRole('link', { name: 'Data sources' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  expect(nav.getAllByRole('link')).toHaveLength(2);
});

it('opens global search after the compact settings menu has closed', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <SettingsNavigation
        sections={[{ id: 'general', label: 'General', icon: FolderIcon }]}
        section="general"
        endpoint="http://delta"
        workspaceRoute="/workspaces/ws/sessions/sess"
      />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Choose settings section' }));
  const opened = vi.fn(() => screen.queryByRole('menu'));
  window.addEventListener('clio:open-command-menu', opened, { once: true });
  await user.click(screen.getByRole('menuitem', { name: 'Search everywhere from settings menu' }));
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
  expect(opened).toHaveReturnedWith(null);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
