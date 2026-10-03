import type { WorkspaceReference } from '@clio/core/v3';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => window.sessionStorage.clear());

describe('useComposerDraft', () => {
  const persistent = { persist: true, endpoint: 'http://local.test' } as const;

  it('discards the temporary entry draft when leaving its page', () => {
    const first = renderHook(() => useComposerDraft('workspace_1', { persist: false }));
    act(() => first.result.current.onValueChange('temporary question'));
    act(() => first.result.current.onReferencesChange([{ offset: 0, reference }]));
    expect(window.sessionStorage.length).toBe(0);
    first.unmount();
    const second = renderHook(() => useComposerDraft('workspace_1', { persist: false }));
    expect(second.result.current.value).toBe('');
    expect(second.result.current.references).toEqual([]);
  });

  it('isolates matching session IDs on different agent endpoints', () => {
    const { result, rerender } = renderHook(
      ({ endpoint }) => useComposerDraft('session_1', { persist: true, endpoint }),
      { initialProps: { endpoint: 'http://local.test' } },
    );
    act(() => result.current.onValueChange('local question'));
    act(() => result.current.onReferencesChange([{ offset: 0, reference }]));
    rerender({ endpoint: 'http://remote.test' });
    expect(result.current.value).toBe('');
    expect(result.current.references).toEqual([]);
    act(() => result.current.onValueChange('remote question'));
    rerender({ endpoint: 'http://local.test' });
    expect(result.current.value).toBe('local question');
  });

  it('restores unsent text after a page remount and clears it after send', () => {
    const first = renderHook(() => useComposerDraft('session_reload', persistent));
    act(() => first.result.current.onValueChange('unsent field note'));
    first.unmount();

    const second = renderHook(() => useComposerDraft('session_reload', persistent));
    expect(second.result.current.value).toBe('unsent field note');
    act(() => second.result.current.onValueChange(''));
    second.unmount();

    const third = renderHook(() => useComposerDraft('session_reload', persistent));
    expect(third.result.current.value).toBe('');
  });

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
