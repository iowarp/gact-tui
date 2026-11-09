import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SESSION_RAIL_STORAGE_KEY } from '@/hooks/use-session-rail-layout';
import { SessionRail } from './session-rail';
import type { SessionRailItem } from './session-rail-layout';

const items: SessionRailItem[] = [
  { id: 'context', summary: '16.6K of 1M', content: <p>Real usage summary</p> },
  { id: 'running', count: 1, content: <p>Current run</p> },
  { id: 'files', count: 2, content: <p>Attached files</p> },
  { id: 'artifacts', count: 3, content: <p>Plots</p> },
];
const regions = () => screen.getAllByRole('region').map((node) => node.getAttribute('aria-label'));

beforeEach(() => {
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
});
afterEach(cleanup);

it('groups sections under Now and In this conversation with their tallies, hiding empty ones', () => {
  render(<SessionRail items={items} />);
  expect(regions()).toEqual([
    'Context section',
    'Running section',
    'Files section',
    'Artifacts section',
  ]);
  expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual([
    'Now',
    'In this conversation',
  ]);
  expect(screen.getByRole('button', { name: 'Expand Context' })).toHaveTextContent('16.6K of 1M');
  // Now opens by default; the inventory waits to be asked for.
  expect(screen.getByText('Current run')).toBeVisible();
  expect(screen.queryByText('Attached files')).not.toBeInTheDocument();
});

it('removes and restores a section without discarding its data, persisting across rail remounts', async () => {
  const user = userEvent.setup();
  const first = render(<SessionRail items={items} />);
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Remove Files' }));
  expect(screen.queryByRole('region', { name: 'Files section' })).not.toBeInTheDocument();
  first.unmount();
  render(<SessionRail items={items} />);
  expect(screen.queryByRole('region', { name: 'Files section' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Add Files' }));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Expand Files' }));
  expect(screen.getByRole('region', { name: 'Files section' })).toHaveTextContent('Attached files');
  expect(JSON.parse(localStorage.getItem(SESSION_RAIL_STORAGE_KEY)!).hidden).not.toContain('files');
});

it('reorders within a group from the keyboard, retains collapse state and restores defaults', async () => {
  const user = userEvent.setup();
  const first = render(<SessionRail items={items} />);
  await user.click(screen.getByRole('button', { name: 'Collapse Running' }));
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  screen.getByRole('button', { name: 'Drag Artifacts in layout' }).focus();
  // Past Connected sources, Sources and Changes, which have nothing yet, to above Files.
  for (let step = 0; step < 4; step++) await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
  expect(screen.getByRole('button', { name: 'Drag Artifacts in layout' })).toHaveFocus();
  first.unmount();
  render(<SessionRail items={items} />);
  expect(regions()).toEqual([
    'Context section',
    'Running section',
    'Artifacts section',
    'Files section',
  ]);
  expect(screen.getByRole('button', { name: 'Expand Running' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Reset layout' }));
  expect(regions()[2]).toBe('Files section');
});

it('recovers from malformed storage and shows empty sections when asked to', async () => {
  localStorage.setItem(SESSION_RAIL_STORAGE_KEY, '{bad');
  const user = userEvent.setup();
  render(<SessionRail items={[]} />);
  expect(screen.getByText(/No sections to show/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('switch', { name: 'Hide empty sections' }));
  await user.keyboard('{Escape}');
  const tools = screen.getByRole('region', { name: 'Tool calls section' });
  expect(within(tools).getByRole('button', { name: 'Expand Tool calls' })).toHaveTextContent('0');
  await user.click(within(tools).getByRole('button', { name: 'Expand Tool calls' }));
  expect(tools).toHaveTextContent('Nothing yet.');
});

it('walks the section rows with the arrow keys', async () => {
  const user = userEvent.setup();
  render(<SessionRail items={items} />);
  screen.getByRole('button', { name: 'Expand Context' }).focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('button', { name: 'Collapse Running' })).toHaveFocus();
  await user.keyboard('{ArrowDown}{ArrowDown}');
  expect(screen.getByRole('button', { name: 'Expand Artifacts' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('button', { name: 'Expand Artifacts' })).toHaveFocus();
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('button', { name: 'Expand Files' })).toHaveFocus();
});
