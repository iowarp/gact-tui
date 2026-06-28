import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendInstallLogLine,
  createSplashElapsedTimer,
  openLogsHintForPath,
  splashStartupModeFromUrl,
} from '../../src/routes/splashModel.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('splashModel', () => {
  it('derives visual startup modes from query params', () => {
    expect(splashStartupModeFromUrl('http://localhost:5173/?route=splash&hold=1')).toBe('hold');
    expect(splashStartupModeFromUrl('http://localhost:5173/?route=splash&install=demo')).toBe(
      'install-demo',
    );
    expect(splashStartupModeFromUrl('http://localhost:5173/?route=splash')).toBe('auto');
    expect(splashStartupModeFromUrl('not a url')).toBe('auto');
  });

  it('appends install log lines while preserving only the newest bounded tail', () => {
    expect(appendInstallLogLine(['a'], 'b', 3)).toEqual(['a', 'b']);
    expect(appendInstallLogLine(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });

  it('formats open-log action hints', () => {
    expect(openLogsHintForPath('/tmp/clio-boot.log')).toBe('Opened /tmp/clio-boot.log');
    expect(openLogsHintForPath(null)).toBe('Logs are only available in the desktop app.');
  });

  it('tracks elapsed splash time until stopped', () => {
    vi.useFakeTimers({ now: 1_000 });
    const values: number[] = [];
    const timer = createSplashElapsedTimer((value) => values.push(value));

    timer.start();
    expect(values).toEqual([0]);

    vi.advanceTimersByTime(500);
    expect(values).toEqual([0, 500]);

    timer.start();
    vi.advanceTimersByTime(500);
    expect(values).toEqual([0, 500, 1_000]);

    timer.stop();
    vi.advanceTimersByTime(1_000);
    expect(values).toEqual([0, 500, 1_000]);
  });
});
