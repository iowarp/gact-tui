// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { followSystemScheme, switchTheme } from './preference';

const transitionsPaused = () => document.documentElement.hasAttribute('data-theme-switching');

describe('switchTheme', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.head.replaceChildren();
  });

  it('keeps color transitions paused until the switched frame has painted (#739)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] });
    const root = document.documentElement;

    switchTheme(root, { id: 'dark', dark: true });

    expect(root.dataset.theme).toBe('dark');
    expect(transitionsPaused()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(transitionsPaused()).toBe(true);
    vi.advanceTimersToNextFrame();
    expect(transitionsPaused()).toBe(true);
    vi.advanceTimersToNextFrame();
    expect(transitionsPaused()).toBe(false);
  });
});

describe('followSystemScheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.replaceChildren();
  });

  it('switches <html> while the OS scheme change is dispatched, before any render (#739)', () => {
    const query = new EventTarget();
    vi.stubGlobal('matchMedia', () => query);
    const root = document.documentElement;
    switchTheme(root, { id: 'light', dark: false });
    const stop = followSystemScheme(() => 'system');

    query.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.theme).toBe('dark');

    stop();
    query.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(root.dataset.theme).toBe('dark');
  });
});
