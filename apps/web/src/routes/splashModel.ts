/**
 * State model for the startup splash screen: the ordered startup phases and
 * their per-phase status.
 */
import { brand } from '@brand';
import type { InstallFailure } from '../tauri.js';

export const SPLASH_INTRO_KEY = 'clio.splash.intro.v1';
export const PURE_WEB_DEFAULT_BACKEND = 'http://localhost:17800';
export const PURE_WEB_PROBE_TIMEOUT_MS = 2_500;
export const TAURI_POLL_INTERVAL_MS = 250;
export const TAURI_MAX_WAIT_MS = 30_000;
export const INSTALL_LOG_MAX_LINES = 200;

export type SplashPhase = 'starting' | 'probing' | 'installing' | 'error' | 'ready';
export type SplashStartupMode = 'auto' | 'hold' | 'install-demo';

export interface SplashElapsedTimer {
  start: () => void;
  stop: () => void;
}

export function createSplashElapsedTimer(
  setElapsedMs: (value: number) => void,
): SplashElapsedTimer {
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;

  return {
    start: () => {
      if (elapsedInterval) return;
      const start = Date.now();
      setElapsedMs(0);
      elapsedInterval = setInterval(() => setElapsedMs(Date.now() - start), 500);
    },
    stop: () => {
      if (!elapsedInterval) return;
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    },
  };
}

export function splashStartupModeFromUrl(href: string): SplashStartupMode {
  try {
    const params = new URL(href).searchParams;
    if (params.get('hold') === '1') return 'hold';
    if (params.get('install') === 'demo') return 'install-demo';
  } catch {
    return 'auto';
  }
  return 'auto';
}

export function appendInstallLogLine(
  prev: readonly string[],
  line: string,
  maxLines = INSTALL_LOG_MAX_LINES,
): string[] {
  const next = [...prev, line];
  return next.length > maxLines ? next.slice(next.length - maxLines) : next;
}

export function loadIntro(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(SPLASH_INTRO_KEY) ?? '';
  } catch {
    return '';
  }
}

export function demoInstallLog(): string[] {
  const runtimeDir = `%LOCALAPPDATA%\\${brand.name.toLowerCase()}\\agent\\.venv`;
  const installSource = brand.backendRepository
    ? `Cloning ${brand.backendRepository.label}@develop…`
    : `Preparing ${brand.name} agent backend…`;
  return [
    installSource,
    `Creating virtualenv at ${runtimeDir}`,
    'Resolving dependencies (142 packages)…',
    'Downloading torch-2.4.0 (797 MB)',
    '  ████████████████░░░░  72%  574 MB / 797 MB',
    'Installing collected packages: numpy, pydantic, fastapi, uvicorn…',
  ];
}

export function installFailureMessage(failure: InstallFailure, force = false): string {
  const code = failure.code == null ? 'could not be launched' : `exited with code ${failure.code}`;
  const verb = force ? 'repair' : 'installer';
  const base = `The backend ${verb} ${code}.`;
  const tail = failure.tail?.trim();
  return tail ? `${base}\n\n${tail}` : base;
}

export function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function openLogsHintForPath(path: string | null): string {
  return path ? `Opened ${path}` : 'Logs are only available in the desktop app.';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function installRecipeForPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const win = /Windows/i.test(navigator.platform) || /Windows/i.test(ua);
  if (win) {
    return [
      "$env:CLIO_REF = 'develop'; irm",
      'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex',
    ].join(' ');
  }
  return [
    'CLIO_REF=develop curl -fsSL',
    'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh | bash',
  ].join(' ');
}
