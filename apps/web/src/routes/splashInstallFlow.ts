/**
 * Drives the first-run install flow on the splash screen (download/install
 * the local backend). Exports {@link createSplashInstallFlow}.
 */
import type { InstallFailure, InstallProgressHandlers } from '../tauri.js';

export interface SplashInstallFlowOptions {
  installClio: () => Promise<void>;
  repairClio: () => Promise<void>;
  onInstallProgress: (handlers: InstallProgressHandlers) => () => void;
  isCancelled: () => boolean;
  onLine: (line: string) => void;
  onDone: () => void;
  onFailed: (failure: InstallFailure, force: boolean) => void;
  onLaunchFailed: (error: unknown, force: boolean) => void;
}

export interface SplashInstallFlow {
  start: (force?: boolean) => void;
  stop: () => void;
}

export function createSplashInstallFlow(options: SplashInstallFlowOptions): SplashInstallFlow {
  let stopInstallEvents: (() => void) | null = null;

  function stop() {
    stopInstallEvents?.();
    stopInstallEvents = null;
  }

  function start(force = false) {
    stop();
    stopInstallEvents = options.onInstallProgress({
      onLine: (line) => {
        if (!options.isCancelled()) options.onLine(line);
      },
      onDone: () => {
        stop();
        if (!options.isCancelled()) options.onDone();
      },
      onFailed: (failure) => {
        stop();
        if (!options.isCancelled()) options.onFailed(failure, force);
      },
    });

    const run = force ? options.repairClio : options.installClio;
    void run().catch((error) => {
      stop();
      if (!options.isCancelled()) options.onLaunchFailed(error, force);
    });
  }

  return { start, stop };
}
