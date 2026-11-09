import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENU_ACTION_EVENT, useMenuAction, useMenuActionAvailable } from './menu-actions';

describe('native menu actions', () => {
  it('routes the shared desktop action to only its registered product workflow', () => {
    const openSettings = vi.fn();
    renderHook(() => useMenuAction('open-settings', openSettings));

    window.dispatchEvent(new CustomEvent(MENU_ACTION_EVENT, { detail: 'new-session' }));
    expect(openSettings).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent(MENU_ACTION_EVENT, { detail: 'open-settings' }));
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('reports an action available only while an enabled workflow handles it', () => {
    const availability = renderHook(() => useMenuActionAvailable('toggle-workbench'));
    expect(availability.result.current).toBe(false);

    const workflow = renderHook(
      ({ enabled }) => useMenuAction('toggle-workbench', () => undefined, enabled),
      { initialProps: { enabled: true } },
    );
    expect(availability.result.current).toBe(true);

    act(() => workflow.rerender({ enabled: false }));
    expect(availability.result.current).toBe(false);

    act(() => workflow.rerender({ enabled: true }));
    expect(availability.result.current).toBe(true);
    act(() => workflow.unmount());
    expect(availability.result.current).toBe(false);
  });

  it('runs the latest handler without re-registering on every render', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const availabilityRenders = vi.fn();
    renderHook(() => {
      availabilityRenders();
      return useMenuActionAvailable('search');
    });
    const workflow = renderHook(({ handler }) => useMenuAction('search', handler), {
      initialProps: { handler: first },
    });
    const rendersAfterMount = availabilityRenders.mock.calls.length;

    workflow.rerender({ handler: latest });
    window.dispatchEvent(new CustomEvent(MENU_ACTION_EVENT, { detail: 'search' }));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(availabilityRenders).toHaveBeenCalledTimes(rendersAfterMount);
  });
});
