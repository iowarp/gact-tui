/**
 * action_card — the generic in-transcript notification/action primitive
 * (frozen wire contract; spotter-ai is the FIRST emitter, not the only one).
 * Pins the render contract from the registry down through Transcript's
 * onCardAction threading (the same shape HandoffPart's onOpenChild uses).
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

  it('renders a stub action disabled, exposing its reason as the tooltip', () => {
    const onCardAction = vi.fn();
    render(
      <Transcript messages={[msg('m1', [SPOTTER_ALERT])]} onCardAction={onCardAction} />,
    );
    const address = screen.getByRole('button', { name: 'Address' });
    expect(address).toBeDisabled();
    expect(address).toHaveAttribute('title', 'remediation lands in phase 2');
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
