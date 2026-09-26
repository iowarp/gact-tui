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
  kind: 'probe' | 'claim' | 'install' | 'start' | 'teardown' | 'tunnel' | 'other',
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
      claim: 'skipped',
      install: 'done',
      start: 'done',
      tunnel: 'done',
      open: 'running',
      cleanup: 'pending',
    });
    expect(progress.stages.find((stage) => stage.id === 'claim')?.hidden).toBe(true);
    expect(progress.stages.find((stage) => stage.id === 'cleanup')?.hidden).toBe(true);
    expect(progress.stages.find((stage) => stage.id === 'authenticate')?.hidden).toBe(true);
    const install = progress.stages.find((stage) => stage.id === 'install');
    // The installer's substep is live progress; a finished install drops it.
    expect(install?.detail).toBeUndefined();
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

  it('an adopted server shows the check with its outcome and skips install and start', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      step('probe', 'done', 2),
      step('claim', 'running', 3),
      step('claim', 'done', 4, 'Reusing the running CLIO (pid 7, /home/a/.local/share/clio)'),
      step('tunnel', 'done', 5),
      { type: 'open', at: 6 },
    ]);
    const claim = progress.stages.find((stage) => stage.id === 'claim');
    expect(claim).toMatchObject({
      state: 'done',
      hidden: false,
      detail: 'Reusing the running CLIO (pid 7, /home/a/.local/share/clio)',
    });
    expect(states(progress)).toMatchObject({ install: 'skipped', start: 'skipped' });
  });

  it('cleanup after a failure appears as its own stage and keeps the failure', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      step('claim', 'done', 2, 'Port 17800 is free'),
      step('start', 'failed', 3, 'server did not become healthy'),
      step('teardown', 'running', 4),
      step('teardown', 'done', 5, 'Stopped the CLIO this deploy started (pid 9)'),
    ]);
    expect(states(progress)).toMatchObject({ start: 'failed', cleanup: 'done' });
    expect(progress.failure?.stage).toBe('start');
    expect(progress.stages.find((stage) => stage.id === 'cleanup')?.detail).toBe(
      'Stopped the CLIO this deploy started (pid 9)',
    );
  });

  it('keeps a failed step’s technical detail for Details, apart from its one-line reason', () => {
    const progress = run([
      { type: 'start', at: 0 },
      { type: 'connected', at: 1 },
      {
        type: 'step',
        step: {
          kind: 'tunnel',
          phase: 'failed',
          detail: 'No server is answering on ares-comp-11:17800',
          log: 'read the tunnel check: An existing connection was forcibly closed (os error 10054)',
          started_at_ms: 10,
          ended_at_ms: 15_010,
        },
        at: 20_000,
      },
    ]);
    expect(progress.failure).toEqual({
      stage: 'tunnel',
      reason: 'No server is answering on ares-comp-11:17800',
      log: 'read the tunnel check: An existing connection was forcibly closed (os error 10054)',
    });
    const tunnel = progress.stages.find((stage) => stage.id === 'tunnel');
    expect((tunnel?.endedAt ?? 0) - (tunnel?.startedAt ?? 0)).toBe(15_000);
  });

  it('formats reasons and elapsed times for people', () => {
    expect(oneLineReason('Installing\n\nerror: disk full\n')).toBe('error: disk full');
    expect(oneLineReason('')).toBe('The deployment failed.');
    expect(formatElapsed(9_400)).toBe('9s');
    expect(formatElapsed(65_000)).toBe('1m 05s');
  });
});
