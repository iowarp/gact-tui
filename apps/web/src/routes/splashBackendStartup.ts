/**
 * Drives the local backend startup sequence shown on the splash screen.
 * Exports {@link createSplashBackendStartup}.
 */
import type { BackendHandle as DesktopHandle, BackendStatus } from '../tauri.js';
import { getBackend } from '../tauri.js';
import type { BackendHandle as FrontendHandle } from '../App.js';
import {
  createSplashBackendHandle,
  probePureWebBackend as probePureWebBackendEndpoint,
} from './splashBackend.js';
import {
  describeError,
  sleep,
  TAURI_MAX_WAIT_MS,
  TAURI_POLL_INTERVAL_MS,
  type SplashElapsedTimer,
  type SplashPhase,
} from './splashModel.js';

export interface SplashBackendStartupOptions {
  isCancelled: () => boolean;
  elapsedTimer: SplashElapsedTimer;
  setPhase: (phase: SplashPhase) => void;
  setError: (error: string) => void;
  onNeedsInstall: () => void;
  onReady: (backend: FrontendHandle) => void;
  onWebFallbackNeeded: () => void;
}

export function createSplashBackendStartup(options: SplashBackendStartupOptions) {
  async function waitForTauriBackend() {
    options.setPhase('starting');
    options.elapsedTimer.start();
    const deadline = Date.now() + TAURI_MAX_WAIT_MS;
    while (!options.isCancelled() && Date.now() < deadline) {
      let handle: DesktopHandle;
      try {
        handle = await getBackend();
      } catch (e) {
        options.setPhase('error');
        options.setError(`Tauri bridge failed: ${describeError(e)}`);
        return;
      }
      const status: BackendStatus = handle.status;
      if (status.kind === 'ready') {
        options.elapsedTimer.stop();
        await handoff(handle.url, handle.bearer_token);
        return;
      }
      if (status.kind === 'needs_install') {
        options.elapsedTimer.stop();
        options.onNeedsInstall();
        return;
      }
      if (status.kind === 'error') {
        options.setPhase('error');
        options.setError(status.detail);
        return;
      }
      await sleep(TAURI_POLL_INTERVAL_MS);
    }
    if (!options.isCancelled()) {
      options.setPhase('error');
      options.setError(
        `Sidecar did not report ready within ${TAURI_MAX_WAIT_MS / 1000}s. ` +
          `Check that the backend is installed and running.`,
      );
    }
  }

  async function probePureWebBackend() {
    options.setPhase('probing');
    const url = await probePureWebBackendEndpoint();
    if (url) {
      await handoff(url, '');
      return;
    }
    if (!options.isCancelled()) {
      options.onWebFallbackNeeded();
    }
  }

  async function handoff(url: string, token: string) {
    try {
      const backend = await createSplashBackendHandle(url, token);
      options.setPhase('ready');
      options.onReady(backend);
    } catch (e) {
      options.setPhase('error');
      options.setError(`capabilities probe failed: ${describeError(e)}`);
    }
  }

  return {
    waitForTauriBackend,
    probePureWebBackend,
  };
}
