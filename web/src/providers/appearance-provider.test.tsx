import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppearanceProvider, useAppearancePreferences } from './appearance-provider';

function wrapper({ children }: PropsWithChildren) {
  return <AppearanceProvider>{children}</AppearanceProvider>;
}

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.clioMotion;
});

describe('appearance preferences', () => {
  it('restores the display-line preference and enforces its supported range', () => {
    const first = renderHook(() => useAppearancePreferences(), { wrapper });
    expect(first.result.current.collapseThreshold).toBe(5);
    act(() => first.result.current.setCollapseThreshold(8));
    first.unmount();
    const restored = renderHook(() => useAppearancePreferences(), { wrapper });
    expect(restored.result.current.collapseThreshold).toBe(8);
    act(() => restored.result.current.setCollapseThreshold(100));
    expect(restored.result.current.collapseThreshold).toBe(50);
    act(() => restored.result.current.setCollapseThreshold(-1));
    expect(restored.result.current.collapseThreshold).toBe(1);
  });

  it('persists motion and conversation width without storing backend state', () => {
    const { result, unmount } = renderHook(() => useAppearancePreferences(), { wrapper });

    act(() => {
      result.current.setMotion('reduced');
      result.current.setConversationWidth('wide');
    });
    expect(result.current.motion).toBe('reduced');
    expect(result.current.conversationWidth).toBe('wide');
    expect(document.documentElement.dataset.clioMotion).toBe('reduced');
    expect(JSON.parse(window.localStorage.getItem('clio.appearance.v1') ?? '{}')).toEqual({
      motion: 'reduced',
      conversationWidth: 'wide',
      collapseThreshold: 5,
      hideDotFiles: false,
    });

    unmount();
    const restored = renderHook(() => useAppearancePreferences(), { wrapper });
    expect(restored.result.current.motion).toBe('reduced');
    expect(restored.result.current.conversationWidth).toBe('wide');
  });

  it('defaults dot files to visible and persists the opt-in "hide" toggle', () => {
    // Owner ruling: the Files view shows ALL dot files/folders (including .clio)
    // by default; "Hide dot files and folders" is an opt-in, off by default.
    const { result, unmount } = renderHook(() => useAppearancePreferences(), { wrapper });
    expect(result.current.hideDotFiles).toBe(false);

    act(() => result.current.setHideDotFiles(true));
    expect(result.current.hideDotFiles).toBe(true);

    unmount();
    const restored = renderHook(() => useAppearancePreferences(), { wrapper });
    expect(restored.result.current.hideDotFiles).toBe(true);
  });

  it('reacts to preference changes from another browser context', () => {
    const { result } = renderHook(() => useAppearancePreferences(), { wrapper });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'clio.appearance.v1',
          newValue: JSON.stringify({ motion: 'reduced', conversationWidth: 'wide' }),
        }),
      );
    });

    expect(result.current.motion).toBe('reduced');
    expect(result.current.conversationWidth).toBe('wide');
  });
});
