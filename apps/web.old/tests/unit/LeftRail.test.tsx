/**
 * Left-rail shell contract.
 *
 * The persistent left viewport is reserved for conversation/session work.
 * Operational surfaces live in Settings and the command palette.
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeftRail } from '../../src/components/LeftRail.js';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

/** Every capability flag on — the maximal destination set. */
const ALL_CAPS: Record<string, boolean> = {
  workspaces: true,
  agent_routing: true,
  commands: true,
  prompts: true,
  mcp: true,
  memory: true,
  metrics: true,
  doctor: true,
  integration_health: true,
};

function renderRail(
  caps: Record<string, boolean | undefined>,
  overrides: Partial<Parameters<typeof LeftRail>[0]> = {},
) {
  const onSelect = vi.fn();
  const onOpenPalette = vi.fn();
  const onOpenCatalog = vi.fn();
  render(() => (
    <LeftRail
      active="sessions"
      caps={caps}
      onSelect={onSelect}
      onOpenPalette={onOpenPalette}
      onOpenCatalog={onOpenCatalog}
      {...overrides}
    />
  ));
  return { onSelect, onOpenPalette, onOpenCatalog };
}

describe('LeftRail destination set', () => {
  it('renders only the session route plus global controls', () => {
    renderRail(ALL_CAPS);
    expect(screen.getByTestId('rail-sessions')).toBeTruthy();
    expect(screen.getByTestId('rail-settings')).toBeTruthy();
    expect(screen.getByTestId('rail-palette')).toBeTruthy();
    for (const id of [
      'workspaces',
      'agents',
      'tools',
      'prompts',
      'mcp',
      'memory',
      'metrics',
      'doctor',
      'plugins',
    ]) {
      expect(screen.queryByTestId(`rail-${id}`)).toBeNull();
    }
  });

  it('defaults to compact icons with accessible labels', () => {
    renderRail(ALL_CAPS);
    // Collapsed by default: labels do not consume first-viewport width, but
    // buttons remain named for assistive tech and tooltips.
    expect(screen.queryByText('Sessions')).toBeNull();
    expect(screen.getByTestId('rail-sessions').getAttribute('aria-label')).toBe('Sessions');
    expect(screen.getByTestId('rail-settings').getAttribute('aria-label')).toBe('Settings');
  });

  it('keeps the catalog out of the persistent rail', () => {
    renderRail(ALL_CAPS);
    expect(screen.queryByTestId('rail-catalog')).toBeNull();
  });

  it('exposes the command palette as a labeled, clickable entry', () => {
    renderRail(ALL_CAPS);
    expect(screen.getByTestId('rail-palette')).toBeTruthy();
    expect(screen.getByTestId('rail-palette').getAttribute('aria-label')).toBe('Open command palette');
  });
});

describe('LeftRail interaction', () => {
  it('fires onSelect with the route id when a destination is clicked', () => {
    const { onSelect } = renderRail(ALL_CAPS);
    fireEvent.click(screen.getByTestId('rail-sessions'));
    expect(onSelect).toHaveBeenCalledWith('sessions');
  });

  it('fires onOpenPalette when the palette entry is clicked', () => {
    const { onOpenPalette } = renderRail(ALL_CAPS);
    fireEvent.click(screen.getByTestId('rail-palette'));
    expect(onOpenPalette).toHaveBeenCalled();
  });

  it('marks the active destination with aria-current=page', () => {
    renderRail(ALL_CAPS, { active: 'sessions' });
    expect(screen.getByTestId('rail-sessions').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('rail-settings').getAttribute('aria-current')).toBeNull();
  });

  it('expands to a labeled rail and persists the choice', () => {
    renderRail(ALL_CAPS);
    // Default collapsed — label hidden.
    expect(screen.queryByText('Sessions')).toBeNull();
    fireEvent.click(screen.getByTestId('rail-toggle'));
    // Expanded — labels visible, icons (testids) remain clickable.
    expect(screen.queryByText('Sessions')).toBeTruthy();
    expect(screen.getByTestId('rail-sessions')).toBeTruthy();
    expect(localStorage.getItem('clio.rail-expanded.v1')).toBe('true');
  });

  it('omits the catalog door when no onOpenCatalog handler is supplied', () => {
    render(() => (
      <LeftRail active="sessions" caps={ALL_CAPS} onSelect={() => {}} onOpenPalette={() => {}} />
    ));
    expect(screen.queryByTestId('rail-catalog')).toBeNull();
  });
});
