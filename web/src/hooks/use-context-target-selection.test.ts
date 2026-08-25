import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useContextTargetSelection } from './use-context-target-selection';

describe('useContextTargetSelection', () => {
  it('returns to the main session when the workspace route changes', () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useContextTargetSelection(sessionId),
      { initialProps: { sessionId: 'sess_parent' } },
    );

    act(() => result.current[1]('sess_child'));
    expect(result.current[0]).toBe('sess_child');

    rerender({ sessionId: 'sess_other' });
    expect(result.current[0]).toBe('sess_other');
  });
});
