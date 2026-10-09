import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useObservabilityNavigation } from './use-observability-navigation';

it('makes repeated tab requests distinct and scopes them to their own session', () => {
  const reveal = vi.fn();
  const { result, rerender } = renderHook(
    ({ sessionId }) => useObservabilityNavigation(sessionId, reveal),
    { initialProps: { sessionId: 'first' } },
  );
  act(() => result.current.openObservability('context'));
  const firstKey = result.current.requestedView?.key;
  act(() => result.current.openObservability('context'));
  expect(result.current.requestedView?.key).not.toBe(firstKey);
  expect(result.current.requestedView?.view).toBe('context');
  expect(reveal).toHaveBeenCalledTimes(2);
  rerender({ sessionId: 'second' });
  expect(result.current.requestedView).toBeUndefined();
  act(() => result.current.openObservability('activity'));
  expect(result.current.requestedView?.view).toBe('activity');
  expect(result.current.requestedView?.sessionId).toBe('second');
});
