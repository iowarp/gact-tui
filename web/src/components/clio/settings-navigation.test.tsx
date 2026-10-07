import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FolderIcon } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
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
    { id: 'blueprints', label: 'Marketplaces', icon: FolderIcon },
    { id: 'appearance', label: 'Appearance', icon: FolderIcon },
  ];
  render(
    <MemoryRouter initialEntries={['/settings/blueprints']}>
      <SettingsNavigation
        sections={sections}
        section="blueprints"
        endpoint="http://delta"
        workspaceRoute="/workspaces/ws/sessions/sess"
      />
      <Location />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Choose settings section' }));
  expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  expect(screen.getByRole('menuitem', { name: 'Marketplaces' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await user.type(screen.getByRole('textbox', { name: 'Search settings sections' }), 'appear');
  expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'Appearance' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Current route')).toHaveTextContent('"path":"/settings/appearance"');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('searches grouped destinations and keywords while preserving navigation context', async () => {
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
  await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'drive');
  expect(nav.getByRole('link', { name: 'Data sources' })).toBeVisible();
  expect(nav.queryByRole('link', { name: 'Appearance' })).not.toBeInTheDocument();
  await user.click(nav.getByRole('link', { name: 'Data sources' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  await user.clear(screen.getByRole('textbox', { name: 'Search settings' }));
  await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'missing');
  expect(nav.getByRole('status')).toHaveTextContent('No matching settings.');
  await user.click(screen.getByRole('button', { name: 'Clear settings search' }));
  expect(nav.getAllByRole('link')).toHaveLength(2);
});
