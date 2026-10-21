import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktopTitleStore } from '@/store/desktop-title';
import { useDesktopTitleSync } from './use-desktop-title-sync';

beforeEach(() => {
  useDesktopTitleStore.getState().clearTitleContext();
});

describe('useDesktopTitleSync', () => {
  it('writes the resolved workspace/session/agent into the shared store', () => {
    renderHook(() =>
      useDesktopTitleSync({ agent: 'EarthScope', session: 'NDP demo', workspace: 'flat-ndp' }),
    );

    expect(useDesktopTitleStore.getState().context).toEqual({
      agent: 'EarthScope',
      session: 'NDP demo',
      workspace: 'flat-ndp',
    });
  });

  it('also writes the agent opener through, for the title bar badge', () => {
    const onOpenAgent = () => undefined;
    renderHook(() =>
      useDesktopTitleSync({
        agent: 'CLIO',
        onOpenAgent,
        session: 'NDP demo',
        workspace: 'flat-ndp',
      }),
    );

    expect(useDesktopTitleStore.getState().context.onOpenAgent).toBe(onOpenAgent);
  });

  it('re-syncs when the input changes across renders', () => {
    const { rerender } = renderHook(
      (props: Parameters<typeof useDesktopTitleSync>[0]) => useDesktopTitleSync(props),
      { initialProps: { session: 'First session', workspace: 'flat-ndp' } },
    );
    expect(useDesktopTitleStore.getState().context.session).toBe('First session');

    rerender({ session: 'Second session', workspace: 'flat-ndp' });
    expect(useDesktopTitleStore.getState().context.session).toBe('Second session');
  });

  it('clears the shared context on unmount, so a later route falls back to the product name', () => {
    const { unmount } = renderHook(() =>
      useDesktopTitleSync({ session: 'NDP demo', workspace: 'flat-ndp' }),
    );
    expect(useDesktopTitleStore.getState().context).not.toEqual({});

    unmount();

    expect(useDesktopTitleStore.getState().context).toEqual({});
  });
});
