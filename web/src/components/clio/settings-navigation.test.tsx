import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FolderIcon } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, expect, it, vi } from 'vitest';
import {
  SettingsNavigation,
  SettingsSearchButton,
  SettingsSectionPicker,
} from './settings-navigation';
import {
  arrivedFromSearch,
  hostSection,
  matchingSettingsSections,
  withoutSearchArrival,
} from '@/lib/settings-window-route';
afterEach(cleanup);

const linkState = { endpoint: 'http://delta', from: '/workspaces/ws/sessions/sess' };
const scopeLabels = { App: 'App', Workspace: 'Flat-NDP', Agent: 'Delta' };
const sections = [
  { id: 'appearance', label: 'Appearance', group: 'App', icon: FolderIcon },
  { id: 'memory', label: 'Memory and instructions', group: 'Workspace', icon: FolderIcon },
  { id: 'models', label: 'Models', group: 'Agent', icon: FolderIcon },
  { id: 'fleet', label: 'Helper models', group: 'Agent', host: 'models', icon: FolderIcon },
  {
    id: 'data-sources',
    label: 'Data sources',
    group: 'Agent',
    keywords: 'drive github globus sign in',
    icon: FolderIcon,
  },
];

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}

it('groups sections by scope, hides folded pages and keeps the route state', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/settings/appearance']}>
      <nav aria-label="Settings sections">
        <SettingsNavigation
          badges={{ memory: { count: 2, label: '2 memory changes waiting for review' } }}
          linkState={linkState}
          scopeLabels={scopeLabels}
          section="fleet"
          sections={sections}
        />
      </nav>
      <Location />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }));
  expect(nav.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
    'App',
    'Flat-NDP',
    'Delta',
  ]);
  expect(nav.queryByRole('link', { name: 'Helper models' })).not.toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Models' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Models' })).toHaveAttribute('title', 'Models');
  expect(nav.getByLabelText('2 memory changes waiting for review')).toHaveTextContent('2');
  await user.click(nav.getByRole('link', { name: 'Data sources' }));
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"path":"/settings/data-sources"',
  );
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '"from":"/workspaces/ws/sessions/sess"',
  );
});

it('lists only the sections a search matches and keeps the search on their links', async () => {
  const user = userEvent.setup();
  const clear = vi.fn();
  render(
    <MemoryRouter initialEntries={['/settings/data-sources?q=drive']}>
      <TooltipProvider>
        <nav aria-label="Settings sections">
          <SettingsNavigation
            filter="drive"
            linkState={linkState}
            onClearFilter={clear}
            scopeLabels={scopeLabels}
            section="data-sources"
            sections={sections}
          />
        </nav>
      </TooltipProvider>
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }));
  expect(nav.getAllByRole('link').map((node) => node.textContent)).toEqual(['Data sources']);
  expect(nav.getByRole('link', { name: 'Data sources' })).toHaveAttribute(
    'href',
    '/settings/data-sources?q=drive',
  );
  expect(nav.getByRole('status')).toHaveTextContent('drive1');
  await user.click(nav.getByRole('button', { name: 'Show every section' }));
  expect(clear).toHaveBeenCalledOnce();
});

it('keeps a host page listed when a search matches a page folded into it', () => {
  expect([...matchingSettingsSections(sections, 'helper')]).toEqual(['models']);
  expect(matchingSettingsSections(sections, 'settings').size).toBe(sections.length - 1);
});

it('marks only the arrival from the search, not later section changes', () => {
  const state = { from: '/workspaces/ws', fromSearch: true };
  expect(arrivedFromSearch(state)).toBe(true);
  expect(withoutSearchArrival(state)).toEqual({ from: '/workspaces/ws' });
  expect(arrivedFromSearch(withoutSearchArrival(state))).toBe(false);
  expect(withoutSearchArrival(linkState)).toBe(linkState);
});

it('maps a folded page to the page that hosts it', () => {
  expect(hostSection(sections, 'fleet')).toBe('models');
  expect(hostSection(sections, 'appearance')).toBe('appearance');
});

it('opens the global search from the title row', async () => {
  const user = userEvent.setup();
  render(<SettingsSearchButton />);
  const opened = vi.fn();
  window.addEventListener('clio:open-command-menu', opened, { once: true });
  await user.click(screen.getByRole('button', { name: 'Search everywhere' }));
  expect(opened).toHaveBeenCalledOnce();
});

it('lists every section in the compact picker and navigates with the keyboard', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/settings/appearance']}>
      <SettingsSectionPicker
        linkState={linkState}
        scopeLabels={scopeLabels}
        section="appearance"
        sections={sections}
      />
      <Location />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Choose settings section' }));
  // Search everywhere plus the four listed sections; the folded page is not listed.
  expect(screen.getAllByRole('menuitem')).toHaveLength(5);
  expect(screen.getByRole('menuitem', { name: 'Appearance' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  screen.getByRole('menuitem', { name: 'Models' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Current route')).toHaveTextContent('"path":"/settings/models"');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('opens global search after the compact settings menu has closed', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <SettingsSectionPicker
        linkState={linkState}
        scopeLabels={scopeLabels}
        section="appearance"
        sections={sections}
      />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Choose settings section' }));
  const opened = vi.fn(() => screen.queryByRole('menu'));
  window.addEventListener('clio:open-command-menu', opened, { once: true });
  await user.click(screen.getByRole('menuitem', { name: /Search everywhere/ }));
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
  expect(opened).toHaveReturnedWith(null);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
