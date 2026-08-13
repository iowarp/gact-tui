/**
 * P5 composer-pill grind (docs/p5/conformance/composer-pill.json, PASS 1
 * re-verify). Failing-first locks for the items the map found not-"match":
 * the ctx-side separator's independence from async, the placement chip's
 * click-through + static dot, the async-runs popover (component + wiring),
 * textarea autogrow, and the `@` picker's real workspace-files backing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncRunsPopover, type AsyncRunItem } from '../../src/composer/AsyncRunsPopover';
import { Composer } from '../../src/composer/Composer';
import { Picker } from '../../src/composer/Picker';
import { ProviderModelPicker } from '../../src/composer/ProviderModelPicker';
import { SessionView } from '../../src/session/SessionView';

describe('pill separators — the ctx-side hairline is independent of async', () => {
  it('renders exactly one separator (placement -> ctx) when there is no async chip', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" contextPercent={7} />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(1);
  });

  it('renders both separators when async and ctx are both present', () => {
    const { container } = render(
      <Composer
        onSubmit={vi.fn()}
        placement="ares:/scratch/j4471"
        asyncCount={2}
        contextPercent={41}
      />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(2);
  });

  it('renders exactly one separator (placement -> async) when there is no ctx chip', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" asyncCount={2} />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(1);
  });

  it('renders no separator when only placement is present', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(0);
  });
});

describe('placement chip — click-through and the static location dot', () => {
  it('becomes a real button that opens the files browser when onOpenPlacement is wired', () => {
    const onOpenPlacement = vi.fn();
    render(
      <Composer
        onSubmit={vi.fn()}
        placement="ares:/scratch/j4471"
        onOpenPlacement={onOpenPlacement}
      />,
    );
    const chip = screen.getByTitle('Open files');
    expect(chip.tagName).toBe('BUTTON');
    fireEvent.click(chip);
    expect(onOpenPlacement).toHaveBeenCalledTimes(1);
  });

  it('renders as inert text (no button) when onOpenPlacement is not supplied', () => {
    render(<Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />);
    const chip = screen.getByText('ares:/scratch/j4471').closest('.kit-chip');
    expect(chip?.tagName).toBe('SPAN');
  });

  it('carries a static location dot, not a pulsing activity dot', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />,
    );
    expect(container.querySelector('.composer__placementdot')).not.toBeNull();
    // The pill must not misuse the shared activity vocabulary (running/
    // queued/error) for a control that never pulses.
    expect(container.querySelector('.composer__placementchip .kit-statusdot')).toBeNull();
  });
});

describe('async runs popover — component behavior', () => {
  const TASKS: AsyncRunItem[] = [
    {
      id: 't1',
      kind: 'agent',
      label: 'visualization #1',
      status: 'running',
      placement: 'local',
      terminal: false,
    },
    { id: 't2', kind: 'agent', label: 'analysis #1', status: 'completed', terminal: true },
  ];

  it('splits rows into the active list and the recently-finished section', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('visualization #1')).toBeInTheDocument();
    expect(screen.getByText('recently finished')).toBeInTheDocument();
    expect(screen.getByText('analysis #1')).toBeInTheDocument();
  });

  it('dismissing a finished row hides it and calls onDismiss with its id', () => {
    const onDismiss = vi.fn();
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={onDismiss}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss analysis #1/i }));
    expect(onDismiss).toHaveBeenCalledWith('t2');
  });

  it('an already-dismissed id is not rendered', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set(['t2'])}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('recently finished')).toBeNull();
    expect(screen.queryByText('analysis #1')).toBeNull();
    // The active row is untouched by dismissal.
    expect(screen.getByText('visualization #1')).toBeInTheDocument();
  });

  it('the run-history link fires onOpenHistory and closes the popover', () => {
    const onOpenHistory = vi.fn();
    const onClose = vi.fn();
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onOpenHistory={onOpenHistory}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /run history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('states plainly when there are no async runs at all', () => {
    render(
      <AsyncRunsPopover open tasks={[]} dismissedIds={new Set()} onDismiss={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/no async runs/i)).toBeInTheDocument();
  });

  it('shows the prototype\'s "Xh Xm" elapsed grammar for an active run with a real startedAt', () => {
    const startedAt = new Date(Date.now() - (2 * 60 + 14) * 60_000).toISOString();
    render(
      <AsyncRunsPopover
        open
        tasks={[
          {
            id: 't1',
            kind: 'agent',
            label: 'gnss-region-watch',
            status: 'running',
            startedAt,
            terminal: false,
          },
        ]}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('2h 14m')).toBeInTheDocument();
  });

  it('shows the prototype\'s "done Xm ago" grammar for a finished run with a real endedAt, and a ✓ for success', () => {
    const endedAt = new Date(Date.now() - 26 * 60_000).toISOString();
    render(
      <AsyncRunsPopover
        open
        tasks={[
          {
            id: 't2',
            kind: 'agent',
            label: 'aftershock-scan',
            status: 'completed',
            endedAt,
            terminal: true,
          },
        ]}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('done 26m ago')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('marks a failed finished run with a ✗ instead of a ✓, distinct from the prototype\'s single happy-path example', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={[
          { id: 't3', kind: 'agent', label: 'catalog-refresh', status: 'failed', terminal: true },
        ]}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('✗')).toBeInTheDocument();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('omits the elapsed/done-ago text rather than guessing when no timestamp is supplied', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={[
          { id: 't4', kind: 'agent', label: 'no-timestamp-run', status: 'running', terminal: false },
        ]}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/^\d+[hm]/)).toBeNull();
  });
});

describe('async runs popover — wired through the composer chip', () => {
  // 1 running + 1 undismissed-terminal — the chip's own count is the sum of
  // both (round-8 fix: "async N" always matches what the popover underneath
  // it lists, not just the running count).
  const TASKS: AsyncRunItem[] = [
    { id: 't1', kind: 'agent', label: 'visualization #1', status: 'running', terminal: false },
    { id: 't2', kind: 'agent', label: 'analysis #1', status: 'completed', terminal: true },
  ];

  it('opens the popover instead of jumping straight to onOpenAsync when asyncTasks is supplied', () => {
    const onOpenAsync = vi.fn();
    render(
      <Composer onSubmit={vi.fn()} asyncCount={1} asyncTasks={TASKS} onOpenAsync={onOpenAsync} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /async 2/ }));
    expect(screen.getByRole('dialog', { name: /async processes/i })).toBeInTheDocument();
    expect(onOpenAsync).not.toHaveBeenCalled();
  });

  it('falls back to a direct onOpenAsync jump when asyncTasks is omitted (prior behavior)', () => {
    const onOpenAsync = vi.fn();
    render(<Composer onSubmit={vi.fn()} asyncCount={1} onOpenAsync={onOpenAsync} />);
    fireEvent.click(screen.getByRole('button', { name: /async 1/ }));
    expect(onOpenAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /async processes/i })).toBeNull();
  });

  it('shows the recently-finished badge, with a titled dot, only while an undismissed finished run is pending review', () => {
    const { container } = render(<Composer onSubmit={vi.fn()} asyncCount={1} asyncTasks={TASKS} />);
    expect(container.querySelector('.composer__asyncchip[data-badge="true"]')).not.toBeNull();
    const badge = container.querySelector('.composer__asyncbadge');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('title', '1 finished async agent');

    fireEvent.click(screen.getByRole('button', { name: /async 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss analysis #1/i }));
    expect(container.querySelector('.composer__asyncchip[data-badge="true"]')).toBeNull();
    expect(container.querySelector('.composer__asyncbadge')).toBeNull();
    // The chip itself survives the dismissal (the still-running task keeps
    // it up) with its count dropped back to just that task.
    expect(screen.getByRole('button', { name: /async 1/ })).toBeInTheDocument();
  });

  it('stays reachable — with the finished-dot — even when every task has already settled (the structural bug this round fixed)', () => {
    // running=0: under the OLD `hasAsync = asyncCount > 0` gate this chip,
    // and the badge inside it, could never render at all.
    const ALL_SETTLED: AsyncRunItem[] = [
      { id: 't1', kind: 'agent', label: 'geospatial #1', status: 'completed', terminal: true },
    ];
    const { container } = render(
      <Composer onSubmit={vi.fn()} asyncCount={0} asyncTasks={ALL_SETTLED} />,
    );
    const chip = screen.getByRole('button', { name: /async 1/ });
    expect(chip).toBeInTheDocument();
    expect(container.querySelector('.composer__asyncchip[data-badge="true"]')).not.toBeNull();
    expect(container.querySelector('.composer__asyncbadge')).toHaveAttribute(
      'title',
      '1 finished async agent',
    );
  });

  it('renders no chip at all once running=0 and every finished task is dismissed', () => {
    const ALL_SETTLED: AsyncRunItem[] = [
      { id: 't1', kind: 'agent', label: 'geospatial #1', status: 'completed', terminal: true },
    ];
    render(<Composer onSubmit={vi.fn()} asyncCount={0} asyncTasks={ALL_SETTLED} />);
    fireEvent.click(screen.getByRole('button', { name: /async 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss geospatial #1/i }));
    expect(screen.queryByText(/^async /)).toBeNull();
  });
});

describe('textarea autogrow', () => {
  it('grows with content up to the 180px cap and shrinks back down when cleared', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    let mockScrollHeight = 26;
    Object.defineProperty(box, 'scrollHeight', {
      configurable: true,
      get: () => mockScrollHeight,
    });

    mockScrollHeight = 90;
    fireEvent.change(box, { target: { value: 'line one\nline two\nline three' } });
    expect(box.style.height).toBe('90px');

    mockScrollHeight = 400; // far past the cap
    fireEvent.change(box, { target: { value: 'x'.repeat(2000) } });
    expect(box.style.height).toBe('180px');

    mockScrollHeight = 22;
    fireEvent.change(box, { target: { value: '' } });
    expect(box.style.height).toBe('22px');
  });
});

describe('popover eyebrows — plain, not the rail\'s bold section-header weight', () => {
  // Measured on the prototype's own popover headers (async runs, model
  // picker, command/file picker): all share the SAME plain 10.5px/.1em/
  // muted treatment. `Eyebrow strong` is a DIFFERENT, bolder style reserved
  // for the rail's own section heads — using it here was a real mismatch.
  it('the `/` and `@` picker header is not the bold rail-section-head weight', () => {
    const { container } = render(
      <Picker
        open
        kind="command"
        label="Commands"
        items={[{ id: 'plan', label: '/plan', detail: 'Plan a task' }]}
        activeIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const eyebrow = container.querySelector('.kit-eyebrow');
    expect(eyebrow).not.toHaveAttribute('data-strong', 'true');
  });

  it('the model picker\'s "providers" and "thinking" headers are not the bold weight', () => {
    const { container } = render(
      <ProviderModelPicker value="" options={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const eyebrows = container.querySelectorAll('.kit-eyebrow');
    expect(eyebrows.length).toBeGreaterThan(0);
    eyebrows.forEach((eyebrow) => expect(eyebrow).not.toHaveAttribute('data-strong', 'true'));
  });
});

describe('model picker — drag-to-resize handle (the prototype\'s pmDragW)', () => {
  it('carries a labelled, keyboard-operable resize separator bounded to the measured min/max', () => {
    render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize model picker/i });
    expect(handle).toHaveAttribute('aria-valuenow', '-560');
    expect(handle).toHaveAttribute('aria-valuemin', '-780');
    expect(handle).toHaveAttribute('aria-valuemax', '-360');
  });

  it('dragging the LEFT edge left (arrow-left, the keyboard equivalent) WIDENS the panel', () => {
    const { container } = render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize model picker/i });
    const panel = () => container.querySelector('.kit-popover') as HTMLElement;
    expect(panel().style.width).toBe('560px');
    // ArrowLeft is the keyboard mirror of dragging the left-edge handle
    // left — the panel is right-anchored, so this must WIDEN it.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panel().style.width).toBe('568px');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(panel().style.width).toBe('552px');
  });

  it('clamps to the 360–780 bounds (repinned 2026-08-13 — owner widened the panel)', () => {
    const { container } = render(<ProviderModelPicker value="" options={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const handle = screen.getByRole('separator', { name: /resize model picker/i });
    const panel = () => container.querySelector('.kit-popover') as HTMLElement;
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(panel().style.width).toBe('780px');
    for (let i = 0; i < 60; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(panel().style.width).toBe('360px');
  });
});

describe('model picker — trigger label on a model-less session (PASS-3 audit correction)', () => {
  const PROVIDERS_ONLY = [
    {
      id: 'anthropic',
      label: 'Anthropic API',
      status: 'missing_key',
      statusLabel: 'missing key',
      models: [{ id: 'anthropic/claude-sonnet', value: 'anthropic/claude-sonnet', label: 'claude-sonnet' }],
    },
  ];

  it('shows a single plain "model not set", never doubled, once the real provider catalogue has loaded', () => {
    // value='' (no model chosen) but the REAL modelProviders catalogue is
    // already populated (the common post-load case) — must not fall back to
    // groupsFromOptions and must not match the sentinel against a real group.
    render(<ProviderModelPicker value="" options={[]} providers={PROVIDERS_ONLY} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /model/i })).toHaveTextContent('model not set');
    expect(screen.queryByText('model not set / model not set')).toBeNull();
  });

  it('shows a single plain "model not set" even during the loading window, when only the synthetic placeholder option exists', () => {
    // No `providers` prop yet (real catalogue still in flight) — the picker
    // falls back to groupsFromOptions(options), and `options` is exactly
    // what SessionView threads through before data arrives: only the
    // synthetic `{id:'', label:'model not set'}` sentinel. This is the
    // window the "model not set / model not set" regression (audit2-fresh
    // .png) actually came from.
    render(
      <ProviderModelPicker value="" options={[{ id: '', label: 'model not set' }]} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: /model/i })).toHaveTextContent('model not set');
    expect(screen.queryByText('model not set / model not set')).toBeNull();
  });

  it('never lists the placeholder sentinel as a selectable provider/model in the popover', () => {
    render(
      <ProviderModelPicker value="" options={[{ id: '', label: 'model not set' }]} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    expect(screen.queryByRole('option', { name: 'model not set' })).toBeNull();
  });
});

describe('model picker — provider row grammar (PASS-3 audit correction)', () => {
  const TWO_PROVIDERS = [
    {
      id: 'anthropic',
      label: 'Anthropic API',
      status: 'missing_key',
      statusLabel: 'missing key',
      models: [],
    },
    {
      id: 'argonne_sophia',
      label: 'ALCF Sophia (Globus Auth)',
      status: 'auth_required',
      statusLabel: 'auth required',
      models: [],
    },
  ];

  it('renders name and status on ONE row (a single 3-column grid, not two stacked lines)', () => {
    const { container } = render(
      <ProviderModelPicker value="" options={[]} providers={TWO_PROVIDERS} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const rows = container.querySelectorAll('.provider-model-picker__provider');
    expect(rows).toHaveLength(2);
    const first = rows[0] as HTMLElement;
    // Name and status are DIRECT children of the same row element (a single
    // grid, `auto minmax(0,1fr) auto`) — not each wrapped in their own
    // stacked-line container, which is what the two-line layout did.
    expect(first.children).toHaveLength(3);
    expect(within(first).getByText('Anthropic API')).toBeInTheDocument();
    expect(within(first).getByText('missing key')).toBeInTheDocument();
  });

  it('never silently omits the prototype\'s per-provider config control — shows it visible, disabled, and flagged (attach-button convention)', () => {
    const { container } = render(
      <ProviderModelPicker value="" options={[]} providers={TWO_PROVIDERS} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const cfgBadges = container.querySelectorAll('.provider-model-picker__cfg');
    expect(cfgBadges).toHaveLength(2);
    cfgBadges.forEach((badge) => {
      expect(badge).toHaveAttribute('data-unbacked', 'true');
      expect(badge.textContent).toContain('default');
      // Not its own nested interactive control — session-scoped switching
      // has no wire, so it must never be a second clickable button inside
      // the provider row's own button.
      expect(badge.tagName).not.toBe('BUTTON');
    });
  });

  it('carries the full status text in a title even though the row visually truncates it (grid-blowout regression)', () => {
    // Probed live against the real backend: argonne_sophia/argonne_metis
    // report a long status_message ("stored Globus token could not be
    // refreshed; authenticate ALCF"). Without an explicit shrink target the
    // row's own grid demanded that text's full nowrap width and squeezed
    // the provider NAME out of view entirely — caught on a live capture
    // (screenshots/side-by-side/_probe-pop2.png), not by jsdom, which
    // never computes layout. The fix constrains the status column's
    // min-content contribution; this locks that the FULL text still
    // reaches the DOM (via title) even once visually clipped.
    const LONG_STATUS = 'stored Globus token could not be refreshed; authenticate ALCF';
    const providers = [
      {
        id: 'argonne_sophia',
        label: 'ALCF Sophia (Globus Auth)',
        status: 'auth_required',
        statusLabel: LONG_STATUS,
        models: [],
      },
    ];
    const { container } = render(
      <ProviderModelPicker value="" options={[]} providers={providers} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const status = container.querySelector('.provider-model-picker__provider small');
    expect(status).toHaveAttribute('title', LONG_STATUS);
    expect(status).toHaveTextContent(LONG_STATUS);
    // The provider name must still be present and unobscured in the DOM —
    // the actual defect was CSS layout squeezing it out of the visible box,
    // which jsdom can't see, but the name node must at least still exist
    // and read correctly regardless.
    expect(within(container).getByText('ALCF Sophia (Globus Auth)')).toBeInTheDocument();
  });

  it('gives the default-config badge a guaranteed minimum width against a long provider name (P5-3, gact-tui#346)', () => {
    // jsdom never computes real layout (getBoundingClientRect stays zeroed),
    // so this can't measure the badge's actual box the way the live capture
    // did. What it CAN prove is the grid contract itself: the name track
    // must be the one that shrinks (flexible, floor 0, already ellipsis-
    // truncated by .provider-model-picker__providername) rather than the
    // unbounded `auto` max that let a long name claim the row and squeeze
    // the badge column to ~4px. Reading the stylesheet locks that contract
    // the same way the panes max-height regression test above does.
    const css = readFileSync(
      resolve(__dirname, '../../src/composer/provider-model-picker.css'),
      'utf8',
    );
    const rule = css.match(/\.provider-model-picker__provider\s*\{([^}]*)\}/s)?.[1] ?? '';
    const columns = rule.match(/grid-template-columns:\s*([^;]+);/)?.[1] ?? '';
    // Name track: flexible with no unbounded max, so it yields space first.
    expect(columns).toMatch(/minmax\(0,\s*1fr\)/);
    // Badge track: a real floor (not 0, not auto-only) so "default ⌄" always
    // has room to render in full.
    expect(columns).toMatch(/minmax\(48px,\s*auto\)/);
    expect(columns).not.toMatch(/minmax\(0,\s*auto\)/);

    // Structural sanity against the exact long-name fixture the audit named:
    // the badge still renders in full with its real text, never dropped or
    // emptied by the layout fix.
    const providers = [
      {
        id: 'argonne_sophia',
        label: 'ALCF Sophia (Globus Auth)',
        status: 'auth_required',
        statusLabel: 'auth required',
        models: [],
      },
    ];
    const { container } = render(
      <ProviderModelPicker value="" options={[]} providers={providers} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const badge = container.querySelector('.provider-model-picker__cfg');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('default');
  });
});

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];
const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    getSession: vi.fn(async () => ({
      id: 'sess_a',
      workspace_id: 'ws_default',
      mode: 'edit',
      approval_mode: 'ask',
    })),
    workspaces: vi.fn(async () => ({
      workspaces: [{ id: 'ws_default', name: 'clio-agent', root_path: '/work/clio-agent' }],
    })),
    workspaceFiles: vi.fn(async () => ({ files: [], next_cursor: null })),
    commands: vi.fn(async () => ({ commands: [] })),
    get: vi.fn(async (path: string) => {
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/async-processes')) return { processes: [] };
      if (path.includes('/context/state')) return { used_pct: 0 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    }),
    ...overrides,
  } as unknown as Client;
}

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

describe('SessionView wiring — the `@` picker is backed by real workspace files', () => {
  it('calls client.workspaceFiles for the session workspace and lists real (non-directory) entries', async () => {
    const workspaceFiles = vi.fn(async () => ({
      files: [
        { path: 'src/App.tsx', type: 'file' },
        { path: 'src/kit', type: 'directory' },
      ],
      next_cursor: null,
    }));
    render(<SessionView client={client({ workspaceFiles })} sessions={SESSIONS} />);
    await selectSession();

    const box = screen.getByRole('textbox', { name: /message/i });
    fireEvent.change(box, { target: { value: '@' } });

    const list = await screen.findByRole('listbox', { name: /files/i });
    expect(within(list).getByText('App.tsx')).toBeInTheDocument();
    // Directories are excluded — the reference picker only offers real files.
    expect(within(list).queryByText('kit')).toBeNull();
    expect(workspaceFiles).toHaveBeenCalledWith('ws_default', expect.objectContaining({ limit: 500 }));
  });

  it('excludes directories using the REAL live wire spelling `type:"dir"`, not just "directory"', async () => {
    // Probed live against 127.0.0.1:17900: clio's GET /v1/workspaces/{id}/files
    // types directories `"dir"`. A fixture that only ever used `"directory"`
    // (above) passes even when the filter checks the wrong string — this
    // proves the exclusion against the spelling the real backend actually
    // sends.
    const workspaceFiles = vi.fn(async () => ({
      files: [
        { path: 'src/App.tsx', type: 'file' },
        { path: '.claude', type: 'dir' },
        { path: '.claude/skills', type: 'dir' },
      ],
      next_cursor: null,
    }));
    render(<SessionView client={client({ workspaceFiles })} sessions={SESSIONS} />);
    await selectSession();

    const box = screen.getByRole('textbox', { name: /message/i });
    fireEvent.change(box, { target: { value: '@' } });

    const list = await screen.findByRole('listbox', { name: /files/i });
    expect(within(list).getByText('App.tsx')).toBeInTheDocument();
    expect(within(list).queryByText('.claude')).toBeNull();
    expect(within(list).queryByText('skills')).toBeNull();
  });
});

describe('SessionView wiring — the placement chip opens this session’s files', () => {
  it('opens the files layer for the active session’s own workspace on click', async () => {
    render(<SessionView client={client()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByTitle('Open files'));
    const dialog = await screen.findByRole('dialog', { name: 'files' });
    expect(dialog).toHaveTextContent('clio-agent');
  });
});

describe('SessionView wiring — the async chip carries real async-processes rows (clio-agent#1205)', () => {
  it('opens a popover fed by the session’s own async-processes, classified active vs finished', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            { kind: 'agent', id: 't1', title: 'visualization #1', status: 'running' },
            { kind: 'agent', id: 't2', title: 'analysis #1', status: 'completed' },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 2/ });
    fireEvent.click(chip);

    const popover = await screen.findByRole('dialog', { name: /async processes/i });
    expect(within(popover).getByText('visualization #1')).toBeInTheDocument();
    expect(within(popover).getByText('analysis #1')).toBeInTheDocument();
    expect(within(popover).getByText('recently finished')).toBeInTheDocument();
  });

  it('threads the real created_at/completed_at wire fields into the popover\'s elapsed text', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            {
              kind: 'agent',
              id: 't1',
              title: 'gnss-region-watch',
              status: 'running',
              created_at: new Date(Date.now() - 12 * 60_000).toISOString(),
            },
            {
              kind: 'agent',
              id: 't2',
              title: 'aftershock-scan',
              status: 'completed',
              created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
              completed_at: new Date(Date.now() - 26 * 60_000).toISOString(),
            },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 2/ });
    fireEvent.click(chip);

    const popover = await screen.findByRole('dialog', { name: /async processes/i });
    expect(within(popover).getByText('12m')).toBeInTheDocument();
    expect(within(popover).getByText('done 26m ago')).toBeInTheDocument();
  });

  it('an agent row click resolves via openChildByHandle, never the right-column peek', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [{ kind: 'agent', id: 'task_1', title: 'geospatial #1', status: 'running' }],
        };
      }
      if (path.includes('/agent-tasks')) {
        return {
          tasks: [{ task_id: 'task_1', handle_id: 'task_1', child_session_id: 'sess_child' }],
        };
      }
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 1/ });
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: /async processes/i });
    fireEvent.click(within(popover).getByText('geospatial #1'));

    // The popover closes on any row click (openRun always calls onClose)...
    await screen.findByRole('button', { name: /async 1/ });
    expect(screen.queryByRole('dialog', { name: /async processes/i })).toBeNull();
    // ...and — the routing decision this test locks — an agent row NEVER
    // opens the read-only right-column peek (that destination is reserved
    // for mcp-task rows, see the sibling test below).
    expect(screen.queryByTestId('mcp-task-peek')).toBeNull();
    expect(screen.queryByTestId('agent-peek')).toBeNull();
  });

  it('an mcp-task row click opens the read-only right-column peek, never center focus', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            {
              kind: 'mcp-task',
              id: 'jarvis-1',
              title: 'jarvis_run',
              status: 'working',
              key: { server_id: 'relay-ares', session_id: 'sess_a', task_id: 'jarvis-1' },
              backend: { cluster: 'ares' },
            },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 1/ });
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: /async processes/i });
    fireEvent.click(within(popover).getByText('jarvis_run'));

    const peek = await screen.findByTestId('mcp-task-peek');
    expect(within(peek).getByTestId('mcp-task-peek-name')).toHaveTextContent('jarvis_run');
    // Read-only: the main transcript stays exactly where it was (its own
    // "ready" message from selectSession), never replaced by a center-focus
    // navigation — a durable MCP task has no child session to drill into.
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('dismissing a settled mcp-task row issues POST /v1/runs/{id}/dismiss (clio-agent#1205 review item 3)', async () => {
    const post = vi.fn(async (path: string) => ({
      dismissed: true,
      handle_id: path.split('/')[3],
    }));
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            { kind: 'mcp-task', id: 'jarvis-done', title: 'jarvis_run', status: 'completed' },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get, post })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 1/ });
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: /async processes/i });

    fireEvent.click(within(popover).getByRole('button', { name: /dismiss jarvis_run/i }));

    // The durable server-side half fires alongside the (already-covered-
    // elsewhere) optimistic local hide, through the SAME existing dismiss
    // control the AgentTask branch already used.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/runs/jarvis-done/dismiss', {}));
  });

  it('a 404 from dismissRun (stale handle / terminality race) is silently absorbed, never an unhandled rejection (clio-agent#1205 review item 1)', async () => {
    const post = vi.fn(async () => {
      throw { status: 404, statusText: 'Not Found', body: '' };
    });
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            { kind: 'mcp-task', id: 'jarvis-stale', title: 'jarvis_run', status: 'completed' },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<SessionView client={client({ get, post })} sessions={SESSIONS} />);
      await selectSession();

      const chip = await screen.findByRole('button', { name: /async 1/ });
      fireEvent.click(chip);
      const popover = await screen.findByRole('dialog', { name: /async processes/i });

      fireEvent.click(within(popover).getByRole('button', { name: /dismiss jarvis_run/i }));

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith('/v1/runs/jarvis-stale/dismiss', {}),
      );
      // A 404 is EXPECTED (stale handle / a client/server terminality race) —
      // never logged, and critically never an unhandled promise rejection.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('a genuine dismissRun failure (not a 404) is logged as a typed reason, not silently swallowed', async () => {
    const post = vi.fn(async () => {
      throw { status: 500, statusText: 'Internal Server Error', body: '' };
    });
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            { kind: 'mcp-task', id: 'jarvis-broken', title: 'jarvis_run', status: 'completed' },
          ],
        };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<SessionView client={client({ get, post })} sessions={SESSIONS} />);
      await selectSession();

      const chip = await screen.findByRole('button', { name: /async 1/ });
      fireEvent.click(chip);
      const popover = await screen.findByRole('dialog', { name: /async processes/i });

      fireEvent.click(within(popover).getByRole('button', { name: /dismiss jarvis_run/i }));

      await waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          '[async-processes] dismissRun failed',
          expect.objectContaining({ id: 'jarvis-broken' }),
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('async-processes SSE refresh is debounced (clio-agent#1205 review item 5)', () => {
  // A real (stubbed-global) EventSource so the mcp_task.* subscription effect
  // actually runs instead of taking its `typeof EventSource === 'undefined'`
  // early return (jsdom has none by default — every other SSE test in this
  // file relies on exactly that early return to make its effects no-ops).
  type Listener = (event: MessageEvent<string>) => void;

  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    listeners = new Map<string, Listener[]>();
    closed = false;
    constructor(public url: string) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: EventListener) {
      const bucket = this.listeners.get(type) ?? [];
      bucket.push(listener as unknown as Listener);
      this.listeners.set(type, bucket);
    }
    removeEventListener(type: string, listener: EventListener) {
      const bucket = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        bucket.filter((l) => l !== (listener as unknown as Listener)),
      );
    }
    close() {
      this.closed = true;
    }
    emit(type: string, data: string) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ data } as MessageEvent<string>);
      }
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function emitMcpTaskUpdated(source: FakeEventSource) {
    source.emit(
      'mcp_task.updated',
      JSON.stringify({
        type: 'mcp_task.updated',
        occurred_at: '2026-08-12T00:00:00Z',
        payload: { key: { task_id: 't1' }, status: 'working' },
      }),
    );
  }

  it('coalesces a burst of mcp_task.* events into ONE refreshPill fan-out, not one per event', async () => {
    let asyncProcessesCalls = 0;
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        asyncProcessesCalls += 1;
        return { processes: [] };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 0 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    const sseUrl = (id: string) => `http://live.test/v1/sessions/${id}/events`;
    render(<SessionView client={client({ get, sseUrl })} sessions={SESSIONS} />);
    await selectSession();

    const mcpSource = FakeEventSource.instances.find((s) => s.listeners.has('mcp_task.updated'));
    expect(mcpSource).toBeDefined();
    const before = asyncProcessesCalls;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emitMcpTaskUpdated(mcpSource!);
        await vi.advanceTimersByTimeAsync(100); // well under the debounce window
        emitMcpTaskUpdated(mcpSource!);
        await vi.advanceTimersByTimeAsync(100);
        emitMcpTaskUpdated(mcpSource!);
        await vi.advanceTimersByTimeAsync(500); // past the debounce window
      });
    } finally {
      vi.useRealTimers();
    }

    // Three events in one burst, ONE trailing-edge refresh — not the 3x (12
    // request) fan-out an unthrottled per-event refresh would have produced.
    expect(asyncProcessesCalls - before).toBe(1);
  });

  it('still refreshes for a single isolated event once the debounce window elapses', async () => {
    let asyncProcessesCalls = 0;
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        asyncProcessesCalls += 1;
        return { processes: [] };
      }
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 0 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    const sseUrl = (id: string) => `http://live.test/v1/sessions/${id}/events`;
    render(<SessionView client={client({ get, sseUrl })} sessions={SESSIONS} />);
    await selectSession();

    const mcpSource = FakeEventSource.instances.find((s) => s.listeners.has('mcp_task.updated'));
    expect(mcpSource).toBeDefined();
    const before = asyncProcessesCalls;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emitMcpTaskUpdated(mcpSource!);
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    // Debouncing must never SUPPRESS a lone event, only coalesce a burst.
    expect(asyncProcessesCalls - before).toBe(1);
  });
});
