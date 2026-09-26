import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployStageList } from './deploy-progress';
import {
  deployProgressReducer,
  initialDeployProgress,
  type DeployEvent,
} from './deploy-progress-model';

const run = (events: DeployEvent[]) => events.reduce(deployProgressReducer, initialDeployProgress);
const stage = (name: string) =>
  screen.getByRole('listitem', { name: new RegExp(`^${name}:`, 'u') });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T22:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DeployStageList', () => {
  it('ticks the running stage live, second by second', () => {
    const t0 = Date.now();
    render(
      <DeployStageList
        progress={run([
          { type: 'start', at: t0 - 5_000 },
          { type: 'connected', at: t0 - 4_000 },
          {
            type: 'step',
            step: { kind: 'tunnel', phase: 'running', detail: '', started_at_ms: t0 },
            at: t0,
          },
        ])}
      />,
    );
    expect(within(stage('Opening tunnel')).getByText('0s')).toBeVisible();
    act(() => vi.advanceTimersByTime(3_000));
    expect(within(stage('Opening tunnel')).getByText('3s')).toBeVisible();
    act(() => vi.advanceTimersByTime(62_000));
    expect(within(stage('Opening tunnel')).getByText('1m 05s')).toBeVisible();
  });

  it('shows a finished step’s real duration even when only its end was observed', () => {
    const t0 = Date.now();
    render(
      <DeployStageList
        progress={run([
          { type: 'start', at: t0 - 60_000 },
          { type: 'connected', at: t0 - 59_000 },
          {
            type: 'step',
            // The start command ran 42 s; its output arrived all at once.
            step: {
              kind: 'start',
              phase: 'done',
              detail: '',
              started_at_ms: t0 - 42_000,
              ended_at_ms: t0,
            },
            at: t0,
          },
        ])}
      />,
    );
    expect(within(stage('Starting server')).getByText('42s')).toBeVisible();
  });
});
