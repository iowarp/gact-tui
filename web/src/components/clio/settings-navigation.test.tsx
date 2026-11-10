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

it('keeps every section listed in the filtered window, counting the matching ones', () => {
  render(
    <MemoryRouter initialEntries={['/settings/data-sources?q=drive']}>
      <TooltipProvider>
        <nav aria-label="Settings sections">
          <SettingsNavigation
            counts={{ 'data-sources': 2 }}
            linkState={linkState}
            scopeLabels={scopeLabels}
            section="data-sources"
            sections={sections}
          />
        </nav>
      </TooltipProvider>
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }));
  expect(nav.getAllByRole('link').length).toBeGreaterThan(1);
  const match = nav.getByRole('link', { name: 'Data sources 2' });
  expect(match).toHaveAttribute('href', '/settings/data-sources');
  expect(match).not.toHaveAttribute('aria-current');
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
  expect(screen.getAllByRole('option')).toHaveLength(5);
  expect(screen.getByRole('option', { name: 'Appearance' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await user.type(screen.getByRole('combobox'), 'mod');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Current route')).toHaveTextContent('"path":"/settings/models"');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
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
  const opened = vi.fn(() => screen.queryByRole('listbox'));
  window.addEventListener('clio:open-command-menu', opened, { once: true });
  await user.click(screen.getByRole('option', { name: /Search everywhere/ }));
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
  expect(opened).toHaveReturnedWith(null);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
