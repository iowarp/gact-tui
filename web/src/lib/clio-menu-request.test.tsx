import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requestClioMenu, useClioMenuRequest } from './clio-menu-request';

describe('requestClioMenu', () => {
  it('reports unhandled when no CLIO menu is listening', () => {
    expect(requestClioMenu()).toBe(false);
  });

  it('opens a listening CLIO menu and reports handled', () => {
    const open = vi.fn();
    const { unmount } = renderHook(() => useClioMenuRequest(open));
    expect(requestClioMenu()).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    unmount();
    expect(requestClioMenu()).toBe(false);
  });

  it('leaves the request unhandled while the menu is covered', () => {
    const open = vi.fn();
    renderHook(() => useClioMenuRequest(open, false));
    expect(requestClioMenu()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
