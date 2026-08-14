/**
 * action_card — the generic in-transcript notification/action primitive
 * (frozen wire contract; spotter-ai is the FIRST emitter, not the only one).
 * Pins the render contract from the registry down through Transcript's
 * onCardAction threading (the same shape HandoffPart's onOpenChild uses).
 *
 * clio#1218c (owner correction 2026-08-14): the card is a bordered
 * information-box OBJECT, not a header pill with inline buttons — these
 * tests also pin the new structure (header/badge/title regions, the
 * severity-accent hook, and hover-only disabled-reason tooltips).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';

function msg(id: string, parts: unknown[]): Message {
  return { id, role: 'assistant', parts: parts as Message['parts'] };
}

const SPOTTER_ALERT = {
  type: 'action_card',
  source: 'spotter-ai',
  severity: 'critical',
  title: 'SPOTTER AI has detected an issue',
  body: 'run-012 anomalous (mean_biomass z=6.1). Campaign quarantined.',
  status: 'active',
  actions: [
    {
      id: 'discuss',
      label: 'Discuss',
      enabled: true,
      behavior: { kind: 'focus_session', handle_id: 'task_xxxx' },
    },
    {
      id: 'address',
      label: 'Address',
      enabled: false,
      behavior: { kind: 'stub', reason: 'remediation lands in phase 2' },
    },
    {
      id: 'remove',
      label: 'Remove',
      enabled: false,
      behavior: { kind: 'stub', reason: 'remediation lands in phase 2' },
    },
  ],
};

describe('action_card part', () => {
  it('renders source, severity, title, and body', () => {
    render(<Transcript messages={[msg('m1', [SPOTTER_ALERT])]} />);
    const card = screen.getByTestId('part-action-card');
    expect(card).toHaveAttribute('data-severity', 'critical');
    expect(within(card).getByText('spotter-ai')).toBeInTheDocument();
    expect(within(card).getByText('critical')).toBeInTheDocument();
    expect(within(card).getByText('SPOTTER AI has detected an issue')).toBeInTheDocument();
    expect(within(card).getByText(/run-012 anomalous/)).toBeInTheDocument();
  });

  it('is a distinct card OBJECT — a bordered container with its own header/actions regions, not a bare pill', () => {
    render(<Transcript messages={[msg('m1', [SPOTTER_ALERT])]} />);
    const card = screen.getByTestId('part-action-card');
    // The container itself carries the severity accent hook (CSS keys the
    // left-border/background tint off this same data-severity attribute —
    // contract/SPEC.md §4.5.2) — never a nested pill-only treatment.
    expect(card).toHaveAttribute('data-severity', 'critical');
    expect(card.className).toContain('part-actioncard');
    // Header row: source+severity badge, then the title as its OWN prominent
    // element (not middot-joined into the badge the way the old pill did).
    const header = within(card).getByTestId('part-actioncard-header');
    const title = header.querySelector('.part-actioncard__title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('SPOTTER AI has detected an issue');
    // The action row renders INSIDE the card, as its own labeled region.
    const actions = within(card).getByTestId('part-actioncard-actions');
    expect(within(actions).getAllByTestId('part-actioncard-action')).toHaveLength(3);
  });

  it('fires onCardAction with the part and the handle_id when an enabled focus_session button is clicked', () => {
    const onCardAction = vi.fn();
    render(
      <Transcript messages={[msg('m1', [SPOTTER_ALERT])]} onCardAction={onCardAction} />,
    );
    const discuss = screen.getByRole('button', { name: 'Discuss' });
    expect(discuss).not.toBeDisabled();
    fireEvent.click(discuss);
    expect(onCardAction).toHaveBeenCalledTimes(1);
    const [calledPart, calledAction] = onCardAction.mock.calls[0]!;
    expect(calledPart.source).toBe('spotter-ai');
    expect(calledAction.behavior).toEqual({ kind: 'focus_session', handle_id: 'task_xxxx' });
  });

  it('renders a stub action disabled, its reason available ONLY as a hover tooltip — never visible inline text', () => {
    const onCardAction = vi.fn();
    render(
      <Transcript messages={[msg('m1', [SPOTTER_ALERT])]} onCardAction={onCardAction} />,
    );
    const card = screen.getByTestId('part-action-card');
    const address = screen.getByRole('button', { name: 'Address' });
    expect(address).toBeDisabled();
    // The reason rides the native `title` attribute (the kit's hover-only
    // tooltip idiom, same pairing ToolbarButton's `unbacked` uses) — never
    // rendered as its own visible text node next to/under the button (owner
    // refinement 2026-08-14: "the buttons render disabled and clean").
    expect(address).toHaveAttribute('title', 'remediation lands in phase 2');
    expect(within(card).queryByText('remediation lands in phase 2')).toBeNull();
    fireEvent.click(address);
    expect(onCardAction).not.toHaveBeenCalled();
  });

  it('renders an unknown behavior kind as a safe, disabled button — never a crash', () => {
    const weird = {
      type: 'action_card',
      source: 'spotter-ai',
      severity: 'info',
      title: 'future capability',
      body: 'a behavior kind this build has never heard of',
      actions: [
        {
          id: 'resolve',
          label: 'Resolve',
          enabled: true,
          behavior: { kind: 'resolve_permission', permission_id: 'perm_1', action: 'allow' },
        },
      ],
    };
    const onCardAction = vi.fn();
    render(<Transcript messages={[msg('m1', [weird])]} onCardAction={onCardAction} />);
    const btn = screen.getByRole('button', { name: 'Resolve' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onCardAction).not.toHaveBeenCalled();
  });

  it('renders an unrecognised severity with the neutral tone, not a crash or a guessed color', () => {
    const futureSeverity = {
      type: 'action_card',
      source: 'spotter-ai',
      severity: 'urgent-future-value',
      title: 'a future severity',
      body: 'body text',
    };
    render(<Transcript messages={[msg('m1', [futureSeverity])]} />);
    const card = screen.getByTestId('part-action-card');
    // The raw wire value is still shown verbatim (never silently dropped)...
    expect(within(card).getByText('urgent-future-value')).toBeInTheDocument();
    // ...but the STYLING attribute falls back to the neutral tone, since this
    // build does not recognise it as warning/critical.
    expect(card).toHaveAttribute('data-severity', 'info');
  });

  it('never crashes on missing/malformed fields — no title, no body, no actions, stray extra fields', () => {
    const sparse = {
      type: 'action_card',
      source: 'spotter-ai',
      // severity, title, body, status, actions all absent.
      unexpected_future_field: { nested: true },
    };
    expect(() =>
      render(<Transcript messages={[msg('m1', [sparse])]} />),
    ).not.toThrow();
    expect(screen.getByTestId('part-action-card')).toBeInTheDocument();
  });

  it('gray-in-place: a resolved card renders every action button disabled, regardless of its own kind/enabled', () => {
    const resolved = { ...SPOTTER_ALERT, status: 'resolved' };
    const onCardAction = vi.fn();
    render(<Transcript messages={[msg('m1', [resolved])]} onCardAction={onCardAction} />);
    const card = screen.getByTestId('part-action-card');
    expect(card).toHaveAttribute('data-status', 'resolved');
    // "Discuss" was an ENABLED focus_session button on the active fixture —
    // resolved must override that, not just leave the stub buttons alone.
    const discuss = screen.getByRole('button', { name: 'Discuss' });
    expect(discuss).toBeDisabled();
    fireEvent.click(discuss);
    expect(onCardAction).not.toHaveBeenCalled();
    for (const label of ['Address', 'Remove']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
  });

  it('treats an unknown or empty status as the active rendering — no gray-in-place', () => {
    const unknownStatus = { ...SPOTTER_ALERT, status: 'some-future-lifecycle-value' };
    const first = render(<Transcript messages={[msg('m1', [unknownStatus])]} />);
    expect(screen.getByTestId('part-action-card')).toHaveAttribute('data-status', 'active');
    expect(screen.getByRole('button', { name: 'Discuss' })).not.toBeDisabled();
    first.unmount();

    const noStatus = { ...SPOTTER_ALERT };
    delete (noStatus as { status?: string }).status;
    render(<Transcript messages={[msg('m2', [noStatus])]} />);
    expect(screen.getByTestId('part-action-card')).toHaveAttribute('data-status', 'active');
  });

  it('never paints a null/object title as "null"/"[object Object]" — non-string, non-number fields render empty', () => {
    const nullTitle = {
      type: 'action_card',
      source: 'spotter-ai',
      severity: 'info',
      title: null,
      body: 'body text stays a string, so it still renders',
    };
    render(<Transcript messages={[msg('m1', [nullTitle])]} />);
    const card = screen.getByTestId('part-action-card');
    expect(card).not.toHaveTextContent('null');
    expect(card).not.toHaveTextContent('[object Object]');
    expect(within(card).getByText(/body text stays a string/)).toBeInTheDocument();
  });

  it('renders zero action buttons, without throwing, when `actions` is not an array', () => {
    for (const badActions of ['not-an-array', { id: 'x' }, 42, true]) {
      const part = {
        type: 'action_card',
        source: 'spotter-ai',
        title: 'malformed actions field',
        actions: badActions,
      };
      const { container, unmount } = render(<Transcript messages={[msg('m1', [part])]} />);
      expect(container.querySelectorAll('.part-actioncard__btn')).toHaveLength(0);
      unmount();
    }
  });

  it('filters out non-record entries from `actions`, rendering only the valid ones', () => {
    const mixedActions = {
      type: 'action_card',
      source: 'spotter-ai',
      title: 'mixed actions array',
      actions: [
        null,
        'a bare string',
        42,
        ['nested', 'array'],
        { id: 'ok', label: 'OK', enabled: true, behavior: { kind: 'stub', reason: 'later' } },
      ],
    };
    render(<Transcript messages={[msg('m1', [mixedActions])]} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('OK');
  });

  it('never crashes when an action is missing its behavior entirely', () => {
    const noBehavior = {
      type: 'action_card',
      source: 'spotter-ai',
      severity: 'warning',
      title: 'no behavior on this action',
      body: 'body',
      actions: [{ id: 'x', label: 'X', enabled: true }],
    };
    render(<Transcript messages={[msg('m1', [noBehavior])]} />);
    const btn = screen.getByRole('button', { name: 'X' });
    // No `behavior.kind` at all resolves the same as an unknown kind: a safe,
    // disabled button rather than a thrown error.
    expect(btn).toBeDisabled();
  });

  it('is covered by the part-renderer registry', async () => {
    const { PART_RENDERERS } = await import('../../src/transcript/registry');
    expect(PART_RENDERERS['action_card']).toBeDefined();
  });
});
