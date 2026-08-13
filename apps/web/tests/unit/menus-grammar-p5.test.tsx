/**
 * P5 grind menus-grammar (docs/p5/conformance/menus-grammar.json) — locks the
 * items that were `deviates`/`missing` when this pass started:
 *
 *  - the kit ContextMenu separator primitive (both danger-item menus lost
 *    their visual break without it)
 *  - the active-item check icon's teal color (kit-wide, was the orange accent)
 *  - the workspace menu's pin LABEL toggling (was a hardcoded string plus a
 *    check-icon column the ground truth's flat menu never has)
 *  - 'remove workspace' going through a confirmation step instead of firing
 *    the DELETE straight from the context-menu click
 *
 * PASS 2 addition: the provider/model picker's SECOND resize handle
 * (`pmDragCol`, measured on the prototype's own popRouter block — default
 * 210px, clamp 150-360, independent of the outer panel-width `pmDragW`
 * handle already implemented) was missing; the provider column was a fixed
 * 178px that matched neither the prototype's default nor its resizability.
 *
 * PASS 3 addition: the rail footer's "relay" cell was a permanently disabled
 * dead control carrying a title claiming "no wire surface yet
 * (clio-agent#1179)" — but #1179 had already landed GET /v1/relay/status,
 * and Settings > Relays already consumed it (settings.test.tsx). Wired the
 * cell to the same relayStatus() call and restored click-through to
 * Settings > Relays (prototype's own `goSettingsRelays`, plain navigation —
 * unlike the "agents" cell, there is no live multi-relay axis here to force
 * a richer switcher).
 *
 * PASS 3 also found (sweeping the provider/model picker's layout under the
 * real ~10-provider catalogue, side-by-side.mjs model-picker capture): its
 * `.panes` grid had a `max-height` with no row-track constraint, so an
 * implicit `auto` row grew past it uncapped and the overflow painted
 * straight over the "thinking" row below instead of being clipped/scrolled
 * by the children's own `overflow-y: auto`. Fixed with `grid-template-rows:
 * minmax(0, 1fr)` + `overflow: hidden` on the row.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Client, Session, Workspace } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { ProviderModelPicker } from '../../src/composer/ProviderModelPicker';
import { ContextMenu, type MenuItemDef } from '../../src/kit';
import { Rail, type RailGroup, type RailProps } from '../../src/shell/Rail';
import { SessionView } from '../../src/session/SessionView';

describe('kit ContextMenu — separator primitive', () => {
  const ITEMS: MenuItemDef[] = [
    { id: 'rename', label: 'rename' },
    { id: 'sep', type: 'separator', label: '' },
    { id: 'delete', label: 'delete', tone: 'danger' },
  ];

  it('renders a divider that carries role="separator", never role="menuitem"', () => {
    render(
      <ContextMenu open x={0} y={0} items={ITEMS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(within(menu).queryAllByRole('menuitem')).toHaveLength(2);
  });

  it('is skipped by arrow-key navigation (never becomes the active row)', () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu open x={0} y={0} items={ITEMS} onSelect={onSelect} onClose={vi.fn()} />,
    );
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });
    // Two ArrowDown hops from -1 must land on 'delete' (index 2), not the
    // separator at index 1 — confirming step() treats it as unnavigable.
    expect(onSelect).toHaveBeenCalledWith('delete');
  });

  it('the checked-item check uses the kit-contextmenu__check class (teal, not the orange accent)', () => {
    render(
      <ContextMenu
        open
        x={0}
        y={0}
        items={[{ id: 'ask', label: 'ask', checked: true }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelector('.kit-contextmenu__check')).not.toBeNull();
  });
});

describe('Rail — workspace/session menu separators + pin label', () => {
  const GROUPS: RailGroup[] = [
    {
      id: 'g1',
      label: '/scratch/j4471',
      count: 1,
      sessions: [{ id: 's1', title: 'alpha', status: 'idle', age: 'now' }],
    },
  ];

  function renderRail(extra: Partial<RailProps> = {}) {
    return render(
      <Rail
        groups={GROUPS}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        {...extra}
      />,
    );
  }

  it('session menu carries a separator between rename and delete', () => {
    const { container } = renderRail({
      onSessionAction: vi.fn(),
      onRenameSession: vi.fn(),
    });
    const row = container.querySelector('.shell-rail__session')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /session menu/i }));
    const menu = screen.getByRole('menu');
    const rows = [...menu.children].filter((el) => el !== menu.querySelector('.kit-contextmenu__eyebrow'));
    const kinds = rows.map((el) => (el.getAttribute('role') === 'separator' ? 'sep' : 'item'));
    expect(kinds).toEqual(['item', 'item', 'sep', 'item']);
  });

  it('workspace menu carries a separator between "new session here" and "remove workspace"', () => {
    const { container } = renderRail({ onNewSession: vi.fn(), onWorkspaceAction: vi.fn() });
    const head = container.querySelector('.shell-rail__grouphead')!;
    fireEvent.click(within(head as HTMLElement).getByRole('button', { name: /workspace menu/i }));
    const menu = screen.getByRole('menu');
    const items = [...menu.querySelectorAll('[role="menuitem"], [role="separator"]')];
    const labels = items.map((el) =>
      el.getAttribute('role') === 'separator' ? '<sep>' : el.textContent?.trim(),
    );
    expect(labels).toEqual([
      'pin workspace',
      'open in files',
      'rename workspace',
      'new session here',
      '<sep>',
      'remove workspace',
    ]);
  });

  it('the workspace pin item toggles its LABEL rather than showing a check icon', () => {
    const pinnedGroups: RailGroup[] = [{ ...GROUPS[0]!, pinned: true }];
    const { container } = render(
      <Rail
        groups={pinnedGroups}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        onWorkspaceAction={vi.fn()}
      />,
    );
    const head = container.querySelector('.shell-rail__grouphead')!;
    fireEvent.click(within(head as HTMLElement).getByRole('button', { name: /workspace menu/i }));
    const menu = screen.getByRole('menu');
    const pinItem = within(menu).getByText('unpin workspace').closest('[role="menuitem"]');
    expect(pinItem).not.toBeNull();
    // The ground-truth workspace menu has no check-icon slot at all.
    expect(pinItem?.querySelector('.kit-contextmenu__check')).toBeNull();
  });
});

describe('SessionView — remove workspace confirmation (wsConfirmOpen)', () => {
  const SESSIONS = [
    { id: 'sess_a', title: 'alpha', status: 'idle', workspace_id: 'ws_default' },
    { id: 'sess_b', title: 'beta', status: 'idle', workspace_id: 'ws_default' },
  ] as unknown as Session[];

  function makeClient(overrides: Record<string, unknown> = {}) {
    return {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: [] })),
      workspaces: vi.fn(async () => ({
        workspaces: [{ id: 'ws_default', name: 'default' }] as unknown as Workspace[],
      })),
      deleteWorkspace: vi.fn(async () => undefined),
      ...overrides,
    } as unknown as Client;
  }

  async function openWorkspaceMenu() {
    const nav = await screen.findByRole('navigation', { name: /workspaces/i });
    const head = within(nav).getAllByRole('button', { name: /workspace menu/i })[0]!;
    fireEvent.click(head);
    return screen.getByRole('menu', { name: /workspace actions/i });
  }

  it('does not call deleteWorkspace on click — it opens a confirm dialog first', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    const menu = await openWorkspaceMenu();
    fireEvent.click(within(menu).getByText('remove workspace'));

    const dialog = await screen.findByRole('dialog', { name: /remove workspace/i });
    expect(dialog.textContent).toMatch(/remove "default" and its 2 session\(s\)/i);
    expect(client.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('cancel leaves the workspace untouched', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    const menu = await openWorkspaceMenu();
    fireEvent.click(within(menu).getByText('remove workspace'));
    const dialog = await screen.findByRole('dialog', { name: /remove workspace/i });
    fireEvent.click(within(dialog).getByText('cancel'));
    expect(screen.queryByRole('dialog', { name: /remove workspace/i })).toBeNull();
    expect(client.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('confirming calls deleteWorkspace exactly once', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    const menu = await openWorkspaceMenu();
    fireEvent.click(within(menu).getByText('remove workspace'));
    const dialog = await screen.findByRole('dialog', { name: /remove workspace/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'remove workspace' }));
    await screen.findByRole('navigation', { name: /workspaces/i });
    expect(client.deleteWorkspace).toHaveBeenCalledTimes(1);
    expect(client.deleteWorkspace).toHaveBeenCalledWith('ws_default');
  });
});

describe('model picker — the provider column\'s own resize handle (pmDragCol)', () => {
  it('carries a SECOND, independently labelled resize separator at the 300/150-460 default+bounds (repinned 2026-08-13 — owner widened the provider column)', () => {
    render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize provider column/i });
    expect(handle).toHaveAttribute('aria-valuenow', '300');
    expect(handle).toHaveAttribute('aria-valuemin', '150');
    expect(handle).toHaveAttribute('aria-valuemax', '460');
    // Distinct from the outer panel-width handle — both must coexist.
    expect(screen.getByRole('separator', { name: /resize model picker/i })).toBeInTheDocument();
  });

  it('dragging RIGHT (arrow-right, the keyboard equivalent) WIDENS the provider column — not inverted, unlike the panel handle', () => {
    const { container } = render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize provider column/i });
    const panes = () => container.querySelector('.provider-model-picker__panes') as HTMLElement;
    expect(panes().style.gridTemplateColumns).toBe('300px minmax(0, 1fr)');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(panes().style.gridTemplateColumns).toBe('308px minmax(0, 1fr)');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panes().style.gridTemplateColumns).toBe('292px minmax(0, 1fr)');
  });

  it('clamps to the 150-460 bounds', () => {
    const { container } = render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize provider column/i });
    const panes = () => container.querySelector('.provider-model-picker__panes') as HTMLElement;
    for (let i = 0; i < 30; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(panes().style.gridTemplateColumns).toBe('460px minmax(0, 1fr)');
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panes().style.gridTemplateColumns).toBe('150px minmax(0, 1fr)');
  });
});

describe('model picker — the panes area actually clips at its max-height, never paints over "thinking"', () => {
  it('gives the implicit grid row a shrinkable track so max-height clips instead of silently overflowing', () => {
    const css = readFileSync(
      resolve(__dirname, '../../src/composer/provider-model-picker.css'),
      'utf8',
    );
    const rule = css.match(/\.provider-model-picker__panes\s*\{([^}]*)\}/s)?.[1] ?? '';
    // `max-height` alone does nothing to an unconstrained `auto` row — it
    // must be paired with a track that can shrink to fit (minmax(0, ...))
    // and a hard clip, or the real ~10-provider catalogue overflows past it
    // and paints over the "thinking" row that follows in normal flow.
    expect(rule).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(rule).toMatch(/max-height:\s*240px/);
    expect(rule).toMatch(/overflow:\s*hidden/);
  });
});

describe('Rail — footer "relay" cell (GET /v1/relay/status, clio-agent#1179)', () => {
  function renderRail(extra: Partial<RailProps> = {}) {
    return render(
      <Rail groups={[]} activeSessionId={null} onSelectSession={vi.fn()} onCollapse={vi.fn()} {...extra} />,
    );
  }

  it('is a live, clickable control — never permanently disabled like the old "no wire surface" placeholder', () => {
    renderRail();
    const cell = screen.getByTestId('rail-relay');
    expect(cell).not.toBeDisabled();
  });

  it('renders the "idle" dot and a plain title before the probe resolves', () => {
    renderRail();
    const cell = screen.getByTestId('rail-relay');
    expect(cell.querySelector('.kit-statusdot')).toHaveAttribute('data-state', 'idle');
    expect(cell).toHaveAttribute('title', 'Relays — opens settings');
  });

  it('renders "idle" (never a false-positive green) when no relay is configured', () => {
    renderRail({ relayStatus: { configured: false } });
    const cell = screen.getByTestId('rail-relay');
    expect(cell.querySelector('.kit-statusdot')).toHaveAttribute('data-state', 'idle');
    expect(cell).toHaveAttribute('title', 'No relay configured — opens settings');
  });

  it('renders "ok" (green) when the probe reports the relay reachable', () => {
    renderRail({
      relayStatus: { configured: true, reachable: true, host: 'ares.example.com' },
    });
    const cell = screen.getByTestId('rail-relay');
    expect(cell.querySelector('.kit-statusdot')).toHaveAttribute('data-state', 'ok');
    expect(cell).toHaveAttribute('title', 'Relay reachable — opens settings');
  });

  it('renders "error" (never silently green) when the probe reports unreachable, and surfaces the detail', () => {
    renderRail({
      relayStatus: {
        configured: true,
        reachable: false,
        host: 'ares.example.com',
        detail: 'connection refused',
      },
    });
    const cell = screen.getByTestId('rail-relay');
    expect(cell.querySelector('.kit-statusdot')).toHaveAttribute('data-state', 'error');
    expect(cell).toHaveAttribute('title', 'Relay unreachable · connection refused — opens settings');
  });

  it('clicking calls onOpenSettings with the \'relays\' section — restoring click-through to Settings > Relays', () => {
    const onOpenSettings = vi.fn();
    renderRail({ onOpenSettings });
    fireEvent.click(screen.getByTestId('rail-relay'));
    expect(onOpenSettings).toHaveBeenCalledWith('relays');
  });
});

describe('SessionView — the rail relay cell deep-links Settings straight to the Relays page', () => {
  const SESSIONS = [
    { id: 'sess_a', title: 'alpha', status: 'idle', workspace_id: 'ws_default' },
  ] as unknown as Session[];

  function makeClient(overrides: Record<string, unknown> = {}) {
    return {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: [] })),
      workspaces: vi.fn(async () => ({
        workspaces: [{ id: 'ws_default', name: 'default' }] as unknown as Workspace[],
      })),
      relayStatus: vi.fn(async () => ({ configured: true, reachable: true, host: 'ares.example.com' })),
      capabilities: vi.fn(async () => ({})),
      ...overrides,
    } as unknown as Client;
  }

  it('opens the Settings layer with Relays already selected, not whatever page opened last', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    await screen.findByTestId('rail-relay');
    fireEvent.click(screen.getByTestId('rail-relay'));

    const layer = await screen.findByRole('dialog', { name: 'Settings' });
    const nav = within(layer).getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('button', { name: /^relays$/i })).toHaveAttribute('aria-current', 'page');
    // The real RelaysPage content, not a placeholder — client.relayStatus()
    // fed straight through, matching settings.test.tsx's own assertion.
    await within(layer).findByText('ares.example.com');
  });

  it('the plain settings gear still opens Settings without forcing a section', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    const gear = await screen.findByRole('button', { name: 'Settings' });
    fireEvent.click(gear);
    const layer = await screen.findByRole('dialog', { name: 'Settings' });
    const nav = within(layer).getByRole('navigation', { name: 'Settings' });
    // Falls back to Settings' own first-page default (backends) — untouched
    // by the relay cell's deep-link.
    expect(within(nav).getByRole('button', { name: /^backends$/i })).toHaveAttribute('aria-current', 'page');
  });
});
