import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENU_ACTION_EVENT, useMenuAction } from './menu-actions';

describe('native menu actions', () => {
  it('routes the shared desktop action to only its registered product workflow', () => {
    const openSettings = vi.fn();
    renderHook(() => useMenuAction('open-settings', openSettings));

    window.dispatchEvent(new CustomEvent(MENU_ACTION_EVENT, { detail: 'new-session' }));
    expect(openSettings).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent(MENU_ACTION_EVENT, { detail: 'open-settings' }));
    expect(openSettings).toHaveBeenCalledOnce();
  });
});
