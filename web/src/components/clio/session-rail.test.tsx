import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SESSION_RAIL_STORAGE_KEY } from '@/hooks/use-session-rail-layout';
import { SessionRail } from './session-rail';
import type { SessionRailItem } from './session-rail-layout';

const items: SessionRailItem[] = [
  { id: 'context', content: <p>Real usage summary</p> },
  { id: 'files', count: 2, content: <p>Attached files</p> },
  { id: 'background', count: 1, content: <p>Current background work</p> },
];
beforeEach(() => {
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
});
afterEach(cleanup);

it('removes and restores a section without discarding its data, persisting across rail remounts', async () => {
  const user = userEvent.setup();
  const first = render(<SessionRail items={items} />);
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Remove Context' }));
  expect(screen.queryByRole('region', { name: 'Context section' })).not.toBeInTheDocument();
  first.unmount();
  render(<SessionRail items={items} />);
  expect(screen.queryByRole('region', { name: 'Context section' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Add Context' }));
  expect(screen.getByRole('region', { name: 'Context section' })).toHaveTextContent(
    'Real usage summary',
  );
  expect(JSON.parse(localStorage.getItem(SESSION_RAIL_STORAGE_KEY)!).hidden).not.toContain(
    'context',
  );
});

it('reorders with accessible row controls, retains collapse state and restores defaults', async () => {
  const user = userEvent.setup();
  const first = render(<SessionRail items={items} />);
  await user.click(screen.getByRole('button', { name: 'Collapse Context' }));
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  screen.getByRole('button', { name: 'Drag Context in layout' }).focus();
  await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
  // Move past the intervening unavailable sections until Background tasks is ahead.
  for (let step = 0; step < 5; step++) await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
  expect(JSON.parse(localStorage.getItem(SESSION_RAIL_STORAGE_KEY)!).order[6]).toBe('context');
  first.unmount();
  render(<SessionRail items={items} />);
  expect(screen.getAllByRole('region').map((node) => node.getAttribute('aria-label'))).toEqual([
    'Background tasks section',
    'Context section',
    'Files section',
  ]);
  expect(screen.getByRole('button', { name: 'Expand Context' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Reset layout' }));
  expect(screen.getAllByRole('region')[0]).toHaveAttribute('aria-label', 'Context section');
});

it('recovers from malformed storage and keeps additions to empty sections for later data', async () => {
  localStorage.setItem(SESSION_RAIL_STORAGE_KEY, '{bad');
  const user = userEvent.setup();
  const view = render(<SessionRail items={[]} />);
  expect(screen.getByText(/No sections to show/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  await user.click(screen.getByRole('button', { name: 'Remove Files' }));
  await user.click(screen.getByRole('button', { name: 'Add Files' }));
  await user.keyboard('{Escape}');
  view.rerender(<SessionRail items={[items[1]!]} />);
  expect(screen.getByRole('region', { name: 'Files section' })).toBeVisible();
});

it('keeps reordering in Customize and preserves expanded content through keyboard moves', async () => {
  const user = userEvent.setup();
  render(<SessionRail items={items} />);
  expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customize rail' }));
  screen.getByRole('button', { name: 'Drag Context in layout' }).focus();
  for (let step = 0; step < 6; step++) await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
  expect(screen.getAllByRole('region').map((node) => node.getAttribute('aria-label'))).toEqual([
    'Background tasks section',
    'Context section',
    'Files section',
  ]);
  expect(screen.getByRole('button', { name: 'Collapse Context' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Drag Context in layout' })).toHaveFocus();
  expect(screen.getByText('Real usage summary')).toBeVisible();
  for (let step = 0; step < 6; step++) await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
  expect(screen.getAllByRole('region')[0]).toHaveAttribute('aria-label', 'Context section');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
});
