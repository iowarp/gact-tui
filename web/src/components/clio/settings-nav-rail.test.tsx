import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderIcon } from 'lucide-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsNavRail } from './settings-nav-rail';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const linkState = { endpoint: 'http://delta', from: '/workspaces/ws/sessions/sess' };
const scopeLabels = { App: 'App', Workspace: 'Flat-NDP', Agent: 'Delta' };
const sections = [
  { id: 'appearance', label: 'Appearance', group: 'App', icon: FolderIcon },
  { id: 'memory', label: 'Memory and instructions', group: 'Workspace', icon: FolderIcon },
  { id: 'models', label: 'Models', group: 'Agent', icon: FolderIcon },
  { id: 'fleet', label: 'Helper models', group: 'Agent', host: 'models', icon: FolderIcon },
  { id: 'data-sources', label: 'Data sources', group: 'Agent', icon: FolderIcon },
];

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}

function renderRail(section = 'fleet') {
  return render(
    <MemoryRouter initialEntries={[`/settings/${section}`]}>
      <TooltipProvider>
        <nav aria-label="Settings scopes">
          <SettingsNavRail
            badges={{ memory: { count: 2, label: '2 memory changes waiting for review' } }}
            linkState={linkState}
            scopeLabels={scopeLabels}
            section={section}
            sections={sections}
          />
        </nav>
      </TooltipProvider>
      <Location />
    </MemoryRouter>,
  );
}

it('folds the sections to one named icon per scope and marks the current one', () => {
  renderRail();
  const rail = within(screen.getByRole('navigation', { name: 'Settings scopes' }));
  const scopes = rail.getAllByRole('button');
  expect(scopes.map((node) => node.getAttribute('aria-label'))).toEqual([
    'App',
    'Flat-NDP',
    'Delta',
  ]);
  // A folded page marks the scope of the page that hosts it.
  expect(rail.getByRole('button', { name: 'Delta' })).toHaveAttribute('aria-current', 'true');
  expect(rail.getByRole('button', { name: 'App' })).not.toHaveAttribute('aria-current');
  expect(rail.getByRole('button', { name: 'Flat-NDP' })).toHaveTextContent('2');
});

it('opens a scope with a click and goes to the chosen section', async () => {
  const user = userEvent.setup();
  renderRail();
  await user.click(screen.getByRole('button', { name: 'Delta' }));
  const menu = within(screen.getByRole('menu'));
  expect(menu.getAllByRole('menuitem').map((node) => node.textContent)).toEqual([
    'Models',
    'Data sources',
  ]);
  expect(menu.getByRole('menuitem', { name: 'Models' })).toHaveAttribute('aria-current', 'page');
  await user.click(menu.getByRole('menuitem', { name: 'Data sources' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"path":"/settings/data-sources"',
  );
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('opens a scope with the right arrow and lists its waiting changes', async () => {
  const user = userEvent.setup();
  renderRail('appearance');
  screen.getByRole('button', { name: 'Flat-NDP' }).focus();
  await user.keyboard('{ArrowRight}');
  const menu = within(screen.getByRole('menu'));
  expect(menu.getByRole('menuitem', { name: /Memory and instructions/ })).toBeInTheDocument();
  expect(menu.getByLabelText('2 memory changes waiting for review')).toHaveTextContent('2');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('opens on hover and closes once the pointer leaves the icon and the list', () => {
  vi.useFakeTimers();
  renderRail();
  const app = screen.getByRole('button', { name: 'App' });
  fireEvent.pointerEnter(app);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByRole('menuitem', { name: 'Appearance' })).toBeInTheDocument();
  fireEvent.pointerLeave(app);
  fireEvent.pointerEnter(screen.getByRole('menu'));
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  fireEvent.pointerLeave(screen.getByRole('menu'));
  act(() => vi.advanceTimersByTime(400));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
