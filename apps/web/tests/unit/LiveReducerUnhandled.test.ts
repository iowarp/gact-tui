import { afterEach, describe, expect, it, vi } from 'vitest';
import { reduce, type ReduceHooks } from '../../src/LiveReducer.js';

function noopHooks(extra?: Partial<ReduceHooks>): ReduceHooks {
  return {
    setMessages: () => {},
    setPendingPermission: () => {},
    setLastCompletion: () => {},
    setCostUsd: () => {},
    setRunningTools: () => {},
    setPendingQuestion: () => {},
    ...extra,
  };
}

describe('LiveReducer unhandled-event observability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes onUnhandled for an unknown event type instead of dropping it', () => {
    const onUnhandled = vi.fn();
    reduce({ type: 'totally.unknown.event', payload: { a: 1 } }, noopHooks({ onUnhandled }));
    expect(onUnhandled).toHaveBeenCalledWith('totally.unknown.event', { a: 1 });
  });

  it('warns when no onUnhandled hook is provided', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reduce({ type: 'totally.unknown.event', payload: {} }, noopHooks());
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('totally.unknown.event');
  });

  it('does not flag a handled event type as unhandled', () => {
    const onUnhandled = vi.fn();
    reduce(
      { type: 'message.completed', payload: { message_id: 'm1' } },
      noopHooks({ onUnhandled }),
    );
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});
