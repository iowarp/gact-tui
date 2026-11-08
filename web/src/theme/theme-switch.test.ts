// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { switchTheme } from './preference';

const transitionsPaused = () =>
  Array.from(document.head.querySelectorAll('style')).some((style) =>
    style.textContent?.includes('transition: none'),
  );

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
