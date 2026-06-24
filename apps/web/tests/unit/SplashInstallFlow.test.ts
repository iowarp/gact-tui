import { describe, expect, it, vi } from 'vitest';
import type { InstallProgressHandlers } from '../../src/tauri.js';
import { createSplashInstallFlow } from '../../src/routes/splashInstallFlow.js';

function createHarness(options: { cancelled?: boolean; installReject?: unknown } = {}) {
  let handlers: InstallProgressHandlers | null = null;
  let cancelled = options.cancelled ?? false;
  const unsubscribe = vi.fn();
  const onLine = vi.fn();
  const onDone = vi.fn();
  const onFailed = vi.fn();
  const onLaunchFailed = vi.fn();
  const installClio = vi.fn().mockImplementation(async () => {
    if (options.installReject) throw options.installReject;
  });
  const repairClio = vi.fn().mockResolvedValue(undefined);
  const onInstallProgress = vi.fn((nextHandlers: InstallProgressHandlers) => {
    handlers = nextHandlers;
    return unsubscribe;
  });

  const flow = createSplashInstallFlow({
    installClio,
    repairClio,
    onInstallProgress,
    isCancelled: () => cancelled,
    onLine,
    onDone,
    onFailed,
    onLaunchFailed,
  });

  return {
    flow,
    installClio,
    repairClio,
    onInstallProgress,
    unsubscribe,
    onLine,
    onDone,
    onFailed,
    onLaunchFailed,
    handlers: () => {
      if (!handlers) throw new Error('install flow did not subscribe');
      return handlers;
    },
    cancel: () => {
      cancelled = true;
    },
  };
}

describe('createSplashInstallFlow', () => {
  it('subscribes to progress before launching the installer', () => {
    const h = createHarness();

    h.flow.start();

    expect(h.onInstallProgress).toHaveBeenCalledTimes(1);
    expect(h.installClio).toHaveBeenCalledTimes(1);
    expect(h.repairClio).not.toHaveBeenCalled();
  });

  it('routes progress lines and stops the subscription when installation completes', () => {
    const h = createHarness();
    h.flow.start();

    h.handlers().onLine('installing dependencies');
    h.handlers().onDone();

    expect(h.onLine).toHaveBeenCalledWith('installing dependencies');
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('uses repair mode and reports installer failures with the force flag', () => {
    const h = createHarness();
    h.flow.start(true);

    h.handlers().onFailed({ code: 2, tail: 'broken env' });

    expect(h.repairClio).toHaveBeenCalledTimes(1);
    expect(h.installClio).not.toHaveBeenCalled();
    expect(h.onFailed).toHaveBeenCalledWith({ code: 2, tail: 'broken env' }, true);
  });

  it('ignores late events after cancellation', () => {
    const h = createHarness();
    h.flow.start();

    h.cancel();
    h.handlers().onLine('late output');
    h.handlers().onDone();

    expect(h.onLine).not.toHaveBeenCalled();
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it('reports launch failures unless the flow has been cancelled', async () => {
    const h = createHarness({ installReject: new Error('missing executable') });

    h.flow.start();
    await vi.waitFor(() => expect(h.onLaunchFailed).toHaveBeenCalledTimes(1));

    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.onLaunchFailed.mock.calls[0]).toMatchObject([expect.any(Error), false]);
  });
});
