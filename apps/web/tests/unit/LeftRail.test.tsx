/**
 * Left-rail completeness (task B1, hermes-agent-desktop.md §1c).
 *
 * The desktop exists for people who'd never open a terminal — so every
 * top-level destination must be reachable by CLICKING a LABELED rail item,
 * not only via Cmd+K. These tests pin:
 *   - the full destination set renders with text labels (not icon-only),
 *   - capability gating hides backend-dependent destinations,
 *   - the catalog (previously Cmd+K-only) has a visible rail door,
 *   - selecting an item / collapsing the rail behave as wired.
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
  it('renders every top-level destination as a clickable rail item', () => {
    renderRail(ALL_CAPS);
    for (const id of [
      'sessions',
      'workspaces',
      'agents',
      'tools',
      'prompts',
      'mcp',
      'memory',
      'metrics',
      'doctor',
      'plugins',
      'settings',
    ]) {
      expect(screen.getByTestId(`rail-${id}`)).toBeTruthy();
    }
  });

  it('labels every item with text — not icon-only mystery-meat', () => {
    renderRail(ALL_CAPS);
    // Expanded by default: text labels are present next to the icons.
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText('Workspaces')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('Commands')).toBeTruthy();
    expect(screen.getByText('Prompts')).toBeTruthy();
    expect(screen.getByText('MCP servers')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Metrics')).toBeTruthy();
    expect(screen.getByText('Doctor')).toBeTruthy();
    expect(screen.getByText('Plugins')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('exposes the catalog (previously Cmd+K-only) as a visible rail door', () => {
    renderRail(ALL_CAPS);
    expect(screen.getByTestId('rail-catalog')).toBeTruthy();
    expect(screen.getByText('Browse catalog')).toBeTruthy();
  });

  it('exposes the command palette as a labeled, clickable entry', () => {
    renderRail(ALL_CAPS);
    expect(screen.getByTestId('rail-palette')).toBeTruthy();
    expect(screen.getByText('Command palette')).toBeTruthy();
  });
});

describe('LeftRail capability gating', () => {
  it('hides backend-dependent destinations when their capability is off', () => {
    // Only sessions/plugins/settings/catalog/palette are capability-free.
    renderRail({});
    expect(screen.getByTestId('rail-sessions')).toBeTruthy();
    expect(screen.getByTestId('rail-plugins')).toBeTruthy();
    expect(screen.getByTestId('rail-settings')).toBeTruthy();
    for (const id of [
      'workspaces',
      'agents',
      'tools',
      'prompts',
      'mcp',
      'memory',
      'metrics',
    ]) {
      expect(screen.queryByTestId(`rail-${id}`)).toBeNull();
    }
  });

  it('shows Doctor when EITHER the TUI or Desktop health flag is set', () => {
    renderRail({ doctor: true });
    expect(screen.getByTestId('rail-doctor')).toBeTruthy();
    cleanup();
    localStorage.clear();
    renderRail({ integration_health: true });
    expect(screen.getByTestId('rail-doctor')).toBeTruthy();
  });

  it('shows only the capabilities advertised by a partial backend', () => {
    renderRail({ mcp: true, prompts: true });
    expect(screen.getByTestId('rail-mcp')).toBeTruthy();
    expect(screen.getByTestId('rail-prompts')).toBeTruthy();
    expect(screen.queryByTestId('rail-agents')).toBeNull();
    expect(screen.queryByTestId('rail-metrics')).toBeNull();
  });
});

describe('LeftRail interaction', () => {
  it('fires onSelect with the route id when a destination is clicked', () => {
    const { onSelect } = renderRail(ALL_CAPS);
    fireEvent.click(screen.getByTestId('rail-agents'));
    expect(onSelect).toHaveBeenCalledWith('agents');
  });

  it('fires onOpenCatalog when the catalog door is clicked', () => {
    const { onOpenCatalog } = renderRail(ALL_CAPS);
    fireEvent.click(screen.getByTestId('rail-catalog'));
    expect(onOpenCatalog).toHaveBeenCalled();
  });

  it('fires onOpenPalette when the palette entry is clicked', () => {
    const { onOpenPalette } = renderRail(ALL_CAPS);
    fireEvent.click(screen.getByTestId('rail-palette'));
    expect(onOpenPalette).toHaveBeenCalled();
  });

  it('marks the active destination with aria-current=page', () => {
    renderRail(ALL_CAPS, { active: 'mcp' });
    expect(screen.getByTestId('rail-mcp').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('rail-sessions').getAttribute('aria-current')).toBeNull();
  });

  it('collapses to an icon-only rail (labels hidden) and persists the choice', () => {
    renderRail(ALL_CAPS);
    // Default expanded — label visible.
    expect(screen.queryByText('Sessions')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rail-toggle'));
    // Collapsed — labels gone, icons (testids) remain clickable.
    expect(screen.queryByText('Sessions')).toBeNull();
    expect(screen.getByTestId('rail-sessions')).toBeTruthy();
    expect(localStorage.getItem('clio.rail-expanded.v1')).toBe('false');
  });

  it('omits the catalog door when no onOpenCatalog handler is supplied', () => {
    render(() => (
      <LeftRail active="sessions" caps={ALL_CAPS} onSelect={() => {}} onOpenPalette={() => {}} />
    ));
    expect(screen.queryByTestId('rail-catalog')).toBeNull();
  });
});
