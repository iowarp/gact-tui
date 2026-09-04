import type { WorkspaceReference } from '@clio/core/v3';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useComposerDraft } from './use-composer-draft';

const reference: WorkspaceReference = {
  kind: 'artifact',
  id: 'artifact_plot',
  label: 'Displacement plot',
  detail: 'Displacement plot v3',
  media_type: 'image/png',
  revision: 'v3',
  navigation: {},
};

describe('useComposerDraft', () => {
  it('holds the text and the references of one draft together', () => {
    const { result } = renderHook(() => useComposerDraft('session_1'));

    act(() => result.current.onValueChange('needs a clearer legend'));
    act(() => result.current.onReferencesChange([{ offset: 0, reference }]));

    expect(result.current.value).toBe('needs a clearer legend');
    expect(result.current.references).toEqual([{ offset: 0, reference }]);
  });

  it('empties both halves when the session changes, and does not leak them back', () => {
    const { rerender, result } = renderHook(({ sessionId }) => useComposerDraft(sessionId), {
      initialProps: { sessionId: 'session_1' },
    });

    act(() => result.current.onValueChange('half-written'));
    act(() => result.current.onReferencesChange([{ offset: 0, reference }]));

    rerender({ sessionId: 'session_2' });
    expect(result.current.value).toBe('');
    expect(result.current.references).toEqual([]);

    // Writing in the second session must not resurrect the first session's chips.
    act(() => result.current.onValueChange('a new question'));
    expect(result.current.references).toEqual([]);
  });

  it('keeps the text when only the references change', () => {
    const { result } = renderHook(() => useComposerDraft('session_1'));

    act(() => result.current.onValueChange('compare these'));
    act(() => result.current.onReferencesChange([{ offset: 12, reference }]));
    act(() => result.current.onReferencesChange([]));

    expect(result.current.value).toBe('compare these');
    expect(result.current.references).toEqual([]);
  });
});
