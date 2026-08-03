/**
 * Shell contract (gact-tui#332) — rail, topbar, ribbon.
 *
 * The shell is pure kit composition over @clio/core store data. These cases
 * pin the structure and the capability rules; geometry is verified visually
 * against the prototype.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/shell/AppShell';
import type { RailGroup } from '../../src/shell/Rail';

const GROUPS: RailGroup[] = [
  {
    id: 'ws_j4471',
    label: '/scratch/j4471',
    count: 9,
    sessions: [
      { id: 'sess_la', title: 'LA ground motion · EarthScope GNSS', status: 'running', age: 'now' },
      { id: 'sess_ast', title: 'asteroid cut-plane render', status: 'idle', age: '4m' },
      { id: 'sess_tape', title: 'scratch cleanup + tape archive', status: 'running', age: 'now' },
    ],
  },
  {
    id: 'ws_hermes',
    label: '/scratch/hermes',
    count: 1,
    sessions: [{ id: 'sess_h1', title: 'ior baseline sweep', status: 'idle', age: '8d' }],
  },
];

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const props = {
    groups: GROUPS,
    activeSessionId: 'sess_la',
    title: 'LA ground motion · EarthScope GNSS',
    breadcrumb: 'earthscope-gnss-region',
    ribbon: [{ id: 'main', label: 'main' }],
    activeRibbonId: 'main',
    onSelectSession: vi.fn(),
    onSelectRibbon: vi.fn(),
    children: <p>transcript</p>,
    ...overrides,
  };
  return { props, ...render(<AppShell {...props} />) };
}

describe('AppShell', () => {
  it('renders the rail, the topbar and the content region', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('LA ground motion');
    expect(screen.getByRole('main')).toHaveTextContent('transcript');
  });

  it('lists every workspace group with its sessions', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    expect(within(rail).getByText('/scratch/j4471')).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'asteroid cut-plane render' })).toBeInTheDocument();
  });

  it('marks the active session as current', () => {
    renderShell();
    const active = screen.getByRole('button', { name: 'LA ground motion · EarthScope GNSS' });
    expect(active).toHaveAttribute('aria-current', 'true');
  });

  it('selects a session', () => {
    const onSelectSession = vi.fn();
    renderShell({ onSelectSession });
    fireEvent.click(screen.getByRole('button', { name: 'ior baseline sweep' }));
    expect(onSelectSession).toHaveBeenCalledWith('sess_h1');
  });

  it('collapses and restores the rail', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /collapse sessions/i }));
    expect(screen.queryByRole('navigation', { name: /workspaces/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show sessions/i }));
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
  });

  it('resizes the rail through the kit splitter', () => {
    renderShell();
    const splitter = screen.getByRole('separator', { name: /rail width/i });
    expect(splitter).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(screen.getByRole('separator', { name: /rail width/i })).toHaveAttribute(
      'aria-valuenow',
      '308',
    );
  });

  it('conveys session status by more than colour', () => {
    renderShell();
    // A 7px dot alone is colour-only; the status must also be readable.
    const active = screen.getByRole('button', { name: 'LA ground motion · EarthScope GNSS' });
    expect(within(active).getByText('running')).toBeInTheDocument();
  });

  it('renders the hierarchy ribbon', () => {
    renderShell();
    expect(screen.getByRole('tablist', { name: /agent hierarchy/i })).toHaveTextContent('main');
  });

  it('hides the workspace console outside the desktop shell', () => {
    // In the prototype exactly one surface is desktop-gated.
    renderShell();
    expect(screen.queryByRole('button', { name: /workspace console/i })).toBeNull();
    expect(screen.getByRole('button', { name: /artifacts/i })).toBeInTheDocument();
  });
});
