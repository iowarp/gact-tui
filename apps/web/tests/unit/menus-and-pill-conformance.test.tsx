/**
 * Omnibus failing-first contract — menu grammar, pill container, new-session
 * dialog, rail hygiene. Every value extracted from the vendored prototype
 * (design/prototype/Clio Session.html): proto-menus.json,
 * proto-composer-menus screenshots, proto-new-session.json.
 *
 * The design's menu-item grammar everywhere: [icon] [title / one-line
 * description], optional check on the active item, optional eyebrow header.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/composer/Composer';
import { Rail, type RailGroup, type RailProps } from '../../src/shell/Rail';

describe('acceptance menu grammar (owner + prototype)', () => {
  function openMenu() {
    render(
      <Composer
        onSubmit={vi.fn()}
        approvalMode="ask"
        onApprovalModeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('composer-approval'));
    return screen.getByRole('menu');
  }

  it('carries the PERMISSIONS eyebrow and two-line iconed items', () => {
    const menu = openMenu();
    expect(menu.textContent).toMatch(/permissions/i);
    const ask = within(menu).getByText('ask').closest('[role="menuitem"]');
    expect(ask?.querySelector('svg')).not.toBeNull();
    expect(ask?.textContent).toContain('Prompt me before every tool call');
  });

  it('describes every backend mode on one line', () => {
    const menu = openMenu();
    expect(menu.textContent).toContain('Auto-approve safe file edits; ask for the rest');
    expect(menu.textContent).toContain('Skip permissions entirely');
    // ai-review is OUR fourth mode (the wire Literal); its description is
    // derived from the #1031 permissions semantics, never left blank.
    const aiReview = within(menu).getByText('ai-review').closest('[role="menuitem"]');
    expect(aiReview?.textContent?.replace('ai-review', '').trim().length).toBeGreaterThan(10);
  });

  it('marks the active mode with a check', () => {
    const menu = openMenu();
    const ask = within(menu).getByText('ask').closest('[role="menuitem"]');
    expect(ask?.querySelector('[data-checked], [data-icon="check"]')).not.toBeNull();
  });
});

describe('pill container (prototype construction)', () => {
  it('is ONE bordered container docked square-to-square with the frame', () => {
    const { container } = render(
      <Composer
        onSubmit={vi.fn()}
        placement="ares:/scratch/j4471"
        asyncCount={2}
        contextPercent={41}
      />,
    );
    // Measured: inline-flex, bg rgb(22,24,29), border rgba(45,99,139,.3),
    // radius 10px 10px 10px 0 (bottom-left square), pad 3px 4px, gap 2px.
    const pill = container.querySelector('.composer__pillbox');
    expect(pill).not.toBeNull();
    expect(pill!.querySelectorAll('.composer__pillsep')).toHaveLength(2);
    expect(pill!.textContent).toContain('async 2');
    expect(pill!.textContent).toContain('ctx 41%');
  });
});

describe('rail hygiene + prototype menus', () => {
  const GROUPS: RailGroup[] = [
    {
      id: 'g1',
      label: '/scratch/j4471',
      count: 2,
      sessions: [
        { id: 's1', title: 'alpha', status: 'running', age: 'now' },
        { id: 's2', title: 'beta', status: 'idle', age: '4m' },
      ],
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

  it('session menu offers exactly the prototype items, iconed', () => {
    const onSessionAction = vi.fn();
    const { container } = renderRail({ onSessionAction, onRenameSession: vi.fn() });
    const row = [...container.querySelectorAll('.shell-rail__session')][0]!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /session menu/i }));
    const menu = screen.getByRole('menu');
    const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((i) =>
      i.textContent?.trim(),
    );
    // Prototype: pin / rename / delete. Fork/Export/Share are NOT in the menu.
    expect(labels).toEqual(['pin', 'rename', 'delete']);
    for (const item of menu.querySelectorAll('[role="menuitem"]')) {
      expect(item.querySelector('svg'), `${item.textContent} lacks an icon`).not.toBeNull();
    }
  });

  it('workspace menu offers the prototype items, iconed', () => {
    const { container } = renderRail({ onNewSession: vi.fn() } as unknown as Partial<RailProps>);
    const head = container.querySelector('.shell-rail__grouphead')!;
    fireEvent.click(within(head as HTMLElement).getByRole('button', { name: /workspace menu/i }));
    const menu = screen.getByRole('menu');
    const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((i) =>
      i.textContent?.trim(),
    );
    expect(labels).toEqual([
      'pin workspace',
      'open in files',
      'rename workspace',
      'new session here',
      'remove workspace',
    ]);
    for (const item of menu.querySelectorAll('[role="menuitem"]')) {
      expect(item.querySelector('svg'), `${item.textContent} lacks an icon`).not.toBeNull();
    }
  });
});
