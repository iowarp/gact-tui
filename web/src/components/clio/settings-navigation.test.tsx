import { cleanup, render, screen } from '@testing-library/react';
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
  await user.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent('"path":"/settings/appearance"');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
