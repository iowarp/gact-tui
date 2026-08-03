import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar, type SidebarSession } from '../../src/components/Sidebar.js';

afterEach(cleanup);

const fixture: SidebarSession[] = [
  { id: 's1', title: 'refactor', status: 'running', project: 'gact-tui', updatedAt: '2m' },
  { id: 's2', title: 'investigate', status: 'idle', project: 'gact-tui', updatedAt: '14m' },
];

describe('Sidebar', () => {
  it('renders one row per session', () => {
    render(() => <Sidebar sessions={fixture} activeId="s1" onSelect={() => {}} />);
    expect(screen.getByTestId('session-row-s1')).toBeTruthy();
    expect(screen.getByTestId('session-row-s2')).toBeTruthy();
  });

  it('shows the empty state when sessions is empty', () => {
    render(() => <Sidebar sessions={[]} activeId="" onSelect={() => {}} />);
    expect(screen.getByTestId('sidebar-empty')).toBeTruthy();
  });

  it('fires onSelect when a row is clicked', () => {
    const onSelect = vi.fn();
    render(() => <Sidebar sessions={fixture} activeId="s1" onSelect={onSelect} />);
    screen.getByTestId('session-row-s2').click();
    expect(onSelect).toHaveBeenCalledWith('s2');
  });
});
