import { describe, expect, it } from 'vitest';
import {
  deployProgressReducer,
  formatElapsed,
  initialDeployProgress,
  oneLineReason,
  type DeployEvent,
  type DeployProgress,
} from './deploy-progress-model';

function run(events: DeployEvent[]): DeployProgress {
  return events.reduce(deployProgressReducer, initialDeployProgress);
}

function states(progress: DeployProgress) {
  return Object.fromEntries(progress.stages.map((stage) => [stage.id, stage.state]));
}

const step = (
  kind: 'probe' | 'install' | 'start' | 'tunnel' | 'other',
  phase: 'running' | 'done' | 'failed',
  at: number,
  detail = '',
): DeployEvent => ({ type: 'step', step: { kind, phase, detail }, at });

describe('deploy progress', () => {
  it('walks the real ares deployment: key auth, probe, install, start, tunnel, open', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 2_000 },
      step('probe', 'running', 2_100),
      step('probe', 'done', 2_600),
      step('install', 'running', 2_700, 'Installing clio-agent[argonne]==0.9.4.17 from PyPI'),
      step('install', 'running', 30_000, 'Installing launcher: /home/a/.local/bin/clio'),
      step('install', 'done', 60_000),
      step('start', 'running', 60_100),
      step('start', 'done', 64_000),
      step('tunnel', 'running', 64_100),
      step('tunnel', 'done', 65_000),
      // The catalog probes again after the install; stages never move back.
      step('probe', 'running', 65_100),
      { type: 'open', at: 66_000 },
    ]);
    expect(states(progress)).toEqual({
      connect: 'done',
      authenticate: 'skipped',
      detect: 'done',
      install: 'done',
      start: 'done',
      tunnel: 'done',
      open: 'running',
    });
    expect(progress.stages.find((stage) => stage.id === 'authenticate')?.hidden).toBe(true);
    const install = progress.stages.find((stage) => stage.id === 'install');
    expect(install?.detail).toBe('Installing launcher: /home/a/.local/bin/clio');
    expect((install?.endedAt ?? 0) - (install?.startedAt ?? 0)).toBe(57_300);
  });

  it('shows Authenticating only once a prompt appears', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'prompt', at: 500 },
      { type: 'prompt', at: 900 },
      { type: 'connected', at: 9_000 },
    ]);
    const auth = progress.stages.find((stage) => stage.id === 'authenticate');
    expect(auth).toMatchObject({ state: 'done', hidden: false, startedAt: 500, endedAt: 9_000 });
    expect(states(progress).connect).toBe('done');
  });

  it('a direct connection skips the tunnel', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      step('start', 'done', 2),
      { type: 'open', at: 3 },
    ]);
    expect(states(progress).tunnel).toBe('skipped');
  });

  it('a failed step owns the failure and its one-line reason', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      step('tunnel', 'failed', 5, 'The tunnel to remote port 17800 did not answer'),
      { type: 'fail', reason: 'did not publish a connection address', at: 6 },
    ]);
    expect(progress.failure).toEqual({
      stage: 'tunnel',
      reason: 'The tunnel to remote port 17800 did not answer',
    });
    expect(states(progress).tunnel).toBe('failed');
  });

  it('a failure outside any step lands on the running stage', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'fail', reason: 'OpenSSH disconnected before authentication finished.', at: 3 },
    ]);
    expect(progress.failure?.stage).toBe('connect');
    expect(states(progress).connect).toBe('failed');
  });

  it('cancel marks the running stage cancelled', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      step('install', 'running', 2),
      { type: 'cancel', at: 3 },
    ]);
    expect(states(progress).install).toBe('cancelled');
  });

  it('formats reasons and elapsed times for people', () => {
    expect(oneLineReason('Installing\n\nerror: disk full\n')).toBe('error: disk full');
    expect(oneLineReason('')).toBe('The deployment failed.');
    expect(formatElapsed(9_400)).toBe('9s');
    expect(formatElapsed(65_000)).toBe('1m 05s');
  });
});
