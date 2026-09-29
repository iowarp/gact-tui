import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  setZoom: vi.fn(),
  currentMonitor: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ setZoom: mocks.setZoom }),
}));
vi.mock('@tauri-apps/api/window', () => ({ currentMonitor: mocks.currentMonitor }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { automaticZoom, stepZoom } from '@/tauri/desktop-zoom';
import { useDesktopZoom } from './use-desktop-zoom';

/** A monitor `width` physical pixels wide at OS scale `scale`. */
function monitor(width: number, scale: number) {
  return { size: { width, height: Math.round(width * 0.5625) }, scaleFactor: scale };
}

function lastZoom(): number {
  return mocks.setZoom.mock.calls.at(-1)?.[0] as number;
}

describe('desktop zoom levels', () => {
  it('scales up only screens that are still very wide after OS scaling', () => {
    expect(automaticZoom(1920)).toBe(1);
    expect(automaticZoom(2560)).toBe(1); // 4K at 150%: already readable
    expect(automaticZoom(3072)).toBe(1.25); // 4K at 125%
    expect(automaticZoom(3840)).toBe(1.5); // 4K at 100%: the reported case
  });

  it('steps along the ladder and stops at its ends', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.2, 1)).toBe(1.25); // off-ladder values snap to the next step
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
});

describe('useDesktopZoom', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.inTauri.mockReturnValue(true);
    mocks.setZoom.mockReset().mockResolvedValue(undefined);
    mocks.currentMonitor.mockReset().mockResolvedValue(monitor(3840, 1));
    mocks.toast.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('starts at the screen-based level on a 4K screen at 100% scaling', async () => {
    const { result } = renderHook(() => useDesktopZoom());
    await waitFor(() => expect(mocks.setZoom).toHaveBeenCalledWith(1.5));
    expect(result.current.zoom).toBe(1.5);
    expect(window.localStorage.getItem('clio.desktop.zoom')).toBeNull();
  });

  it('leaves an ordinary screen at 100%', async () => {
    mocks.currentMonitor.mockResolvedValue(monitor(1920, 1));
    renderHook(() => useDesktopZoom());
    await waitFor(() => expect(mocks.setZoom).toHaveBeenCalledWith(1));
  });

  it('zooms with Ctrl + and Ctrl -, remembers the choice, and resets with Ctrl 0', async () => {
    const { result } = renderHook(() => useDesktopZoom());
    await waitFor(() => expect(lastZoom()).toBe(1.5));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true }));
    });
    expect(result.current.zoom).toBe(1.75);
    expect(window.localStorage.getItem('clio.desktop.zoom')).toBe('1.75');
    await waitFor(() => expect(lastZoom()).toBe(1.75));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true }));
    });
    expect(result.current.zoom).toBe(1.25);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
    });
    await waitFor(() => expect(lastZoom()).toBe(1.5));
    expect(window.localStorage.getItem('clio.desktop.zoom')).toBeNull();
  });

  it('zooms with Ctrl + wheel, one step per notch, and ignores a plain scroll', async () => {
    const { result } = renderHook(() => useDesktopZoom());
    await waitFor(() => expect(lastZoom()).toBe(1.5));
    mocks.setZoom.mockClear();

    const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    act(() => {
      window.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);
    expect(result.current.zoom).toBe(1.5);

    const notch = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    act(() => {
      window.dispatchEvent(notch);
    });
    expect(notch.defaultPrevented).toBe(true);
    expect(result.current.zoom).toBe(1.75);

    // A trackpad pinch sends many small deltas: they add up to one step.
    act(() => {
      for (let i = 0; i < 4; i += 1) {
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, ctrlKey: true }));
      }
    });
    expect(result.current.zoom).toBe(1.75);
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, ctrlKey: true }));
    });
    expect(result.current.zoom).toBe(1.5);
    await waitFor(() => expect(lastZoom()).toBe(1.5));
  });

  it('restores a saved choice instead of the screen-based level', async () => {
    window.localStorage.setItem('clio.desktop.zoom', '1.1');
    const { result } = renderHook(() => useDesktopZoom());
    await waitFor(() => expect(mocks.setZoom).toHaveBeenCalledWith(1.1));
    expect(result.current.zoom).toBe(1.1);
    expect(mocks.setZoom).not.toHaveBeenCalledWith(1.5);
  });

  it('does nothing outside the desktop app', async () => {
    mocks.inTauri.mockReturnValue(false);
    renderHook(() => useDesktopZoom());
    const event = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(mocks.setZoom).not.toHaveBeenCalled();
  });
});
