/**
 * Orchestrates the startup splash flow: backend startup, install steps, and the
 * transition into the connected app.
 */
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import {
  inTauri,
  installClio,
  onInstallProgress,
  openLogs,
  readLogs,
  repairClio,
} from '../tauri.js';
import type { BackendHandle as FrontendHandle } from '../App.js';
import { createSplashBackendStartup } from './splashBackendStartup.js';
import { createSplashInstallFlow } from './splashInstallFlow.js';
import {
  appendInstallLogLine,
  createSplashElapsedTimer,
  demoInstallLog,
  describeError,
  INSTALL_LOG_MAX_LINES,
  installFailureMessage,
  loadIntro,
  openLogsHintForPath,
  type SplashPhase,
  splashStartupModeFromUrl,
} from './splashModel.js';
import type { PureWebBackendCandidate } from './splashBackend.js';

export interface SplashControllerOptions {
  onReady: (backend: FrontendHandle) => void;
  onWebFallbackNeeded: () => void;
  pureWebCandidates?: () => readonly PureWebBackendCandidate[];
  isRegistryHydrated?: () => boolean;
}

export function createSplashController(options: SplashControllerOptions) {
  const [phase, setPhase] = createSignal<SplashPhase>('starting');
  const [error, setError] = createSignal<string | null>(null);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [installLog, setInstallLog] = createSignal<string[]>([]);
  const [installFailed, setInstallFailed] = createSignal(false);
  const [logHint, setLogHint] = createSignal<string | null>(null);
  const [bootLog, setBootLog] = createSignal<string | null>(null);
  const [logCopied, setLogCopied] = createSignal(false);
  const intro = loadIntro();
  const elapsedTimer = createSplashElapsedTimer(setElapsedMs);

  let cancelled = false;
  let logPaneEl: HTMLPreElement | undefined;

  function setLogPaneRef(el: HTMLPreElement) {
    logPaneEl = el;
  }

  function appendInstallLine(line: string) {
    setInstallLog((prev) => appendInstallLogLine(prev, line, INSTALL_LOG_MAX_LINES));
    queueMicrotask(() => {
      if (logPaneEl) logPaneEl.scrollTop = logPaneEl.scrollHeight;
    });
  }

  const backendStartup = createSplashBackendStartup({
    isCancelled: () => cancelled,
    elapsedTimer,
    setPhase,
    setError,
    onNeedsInstall: () => startInstall(),
    onReady: options.onReady,
    onWebFallbackNeeded: options.onWebFallbackNeeded,
    pureWebCandidates: options.pureWebCandidates,
    isRegistryHydrated: options.isRegistryHydrated,
  });

  onMount(() => {
    const startupMode = splashStartupModeFromUrl(window.location.href);
    if (startupMode === 'hold') {
      setPhase('starting');
      return;
    }
    if (startupMode === 'install-demo') {
      setPhase('installing');
      setInstallLog(demoInstallLog());
      return;
    }
    if (inTauri()) {
      void backendStartup.waitForTauriBackend();
    } else {
      void backendStartup.probePureWebBackend();
    }
  });

  // Pull the persisted boot-log transcript into the failure card the moment we
  // enter the error phase, so the user can read AND copy it without leaving the
  // app (the OS "Open logs" reveal is kept as a secondary action). Cleared when
  // leaving the error phase so a later retry starts fresh.
  createEffect(() => {
    if (phase() === 'error' && inTauri()) {
      void readLogs()
        .then((text) => setBootLog(text && text.trim() ? text : null))
        .catch(() => setBootLog(null));
    } else if (phase() !== 'error') {
      setBootLog(null);
      setLogCopied(false);
    }
  });

  async function copyLogs() {
    const text = bootLog();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setLogCopied(true);
      setTimeout(() => setLogCopied(false), 2000);
    } catch {
      setLogCopied(false);
    }
  }

  onCleanup(() => {
    cancelled = true;
    elapsedTimer.stop();
    installFlow.stop();
  });

  const installFlow = createSplashInstallFlow({
    installClio,
    repairClio,
    onInstallProgress,
    isCancelled: () => cancelled,
    onLine: appendInstallLine,
    onDone: () => {
      void backendStartup.waitForTauriBackend();
    },
    onFailed: (failure, force) => {
      setInstallFailed(true);
      setPhase('error');
      setError(installFailureMessage(failure, force));
    },
    onLaunchFailed: (e, force) => {
      setInstallFailed(true);
      setPhase('error');
      setError(`${force ? 'Repair' : 'Auto-install'} couldn't start: ${describeError(e)}`);
    },
  });

  function startInstall(force = false) {
    setInstallLog([]);
    setError(null);
    setLogHint(null);
    setInstallFailed(false);
    setPhase('installing');
    cancelled = false;

    installFlow.start(force);
  }

  async function openLogsAction() {
    setLogHint(null);
    try {
      const path = await openLogs();
      setLogHint(openLogsHintForPath(path));
    } catch (e) {
      setLogHint(`Could not open logs: ${describeError(e)}`);
    }
  }

  function retryFromError() {
    if (installFailed()) {
      startInstall();
      return;
    }
    setError(null);
    setLogHint(null);
    cancelled = false;
    if (inTauri()) {
      void backendStartup.waitForTauriBackend();
    } else {
      void backendStartup.probePureWebBackend();
    }
  }

  return {
    phase,
    error,
    elapsedMs,
    installLog,
    installFailed,
    logHint,
    intro,
    bootLog,
    logCopied,
    setLogPaneRef,
    retryFromError,
    repair: () => startInstall(true),
    openLogsAction,
    copyLogs,
  };
}
