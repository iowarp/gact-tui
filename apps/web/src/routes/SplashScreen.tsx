import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Capabilities } from '@clio/core';
import { Client } from '@clio/core';
import type {
  BackendHandle as DesktopHandle,
  BackendStatus,
  InstallFailure,
} from '../tauri.js';
import { getRequestLocale } from '../locale.js';
import {
  getBackend,
  inTauri,
  installClio,
  onInstallProgress,
  openLogs,
  repairClio,
  tauriFetch,
} from '../tauri.js';

export const SPLASH_INTRO_KEY = 'clio.splash.intro.v1';

function loadIntro(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(SPLASH_INTRO_KEY) ?? '';
  } catch {
    return '';
  }
}
import type { BackendHandle as FrontendHandle } from '../App.js';
import './splash.css';

/**
 * Splash screen — the front door for both the Tauri shell and the
 * pure-web build.
 *
 * - In Tauri: polls `get_backend` until status flips from `starting`
 *   to `ready` (or `error`). The bundled clio-agent-gact sidecar is
 *   already spawning in the Rust supervisor; we just wait.
 * - In a pure browser: probes `http://localhost:17800/v1/capabilities`
 *   directly. If it answers, transition to chat. If not, surface a
 *   "manual connect" prompt that opens ConnectScreen (rendered as a
 *   sibling route, not the default).
 *
 * Either way, the user never sees a URL/token form at app start
 * unless the auto-probe failed.
 */
export interface SplashScreenProps {
  onReady: (b: FrontendHandle) => void;
  onWebFallbackNeeded: () => void;
}

const PURE_WEB_DEFAULT_BACKEND = 'http://localhost:17800';
const PURE_WEB_PROBE_TIMEOUT_MS = 2_500;
const TAURI_POLL_INTERVAL_MS = 250;
const TAURI_MAX_WAIT_MS = 30_000;
/** Lines kept in the scrolling install log pane (newest-trailing). */
const INSTALL_LOG_MAX_LINES = 200;

export function SplashScreen(props: SplashScreenProps) {
  const [phase, setPhase] = createSignal<
    'starting' | 'probing' | 'installing' | 'error' | 'ready'
  >('starting');
  const [error, setError] = createSignal<string | null>(null);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [installLog, setInstallLog] = createSignal<string[]>([]);
  // True when the current `error` phase was reached via a failed auto-install
  // (as opposed to a generic backend error). Drives the install-specific
  // testids + a Retry that re-runs the installer rather than re-polling.
  const [installFailed, setInstallFailed] = createSignal(false);
  // Transient status line for the "Open logs" action so a reveal failure
  // (no Tauri / log not yet written) is surfaced as a hint, not silence.
  const [logHint, setLogHint] = createSignal<string | null>(null);

  let cancelled = false;
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let stopInstallEvents: (() => void) | null = null;
  let logPaneEl: HTMLPreElement | undefined;

  function appendInstallLine(line: string) {
    setInstallLog((prev) => {
      const next = [...prev, line];
      return next.length > INSTALL_LOG_MAX_LINES
        ? next.slice(next.length - INSTALL_LOG_MAX_LINES)
        : next;
    });
    // Auto-scroll to the newest line after the DOM updates.
    queueMicrotask(() => {
      if (logPaneEl) logPaneEl.scrollTop = logPaneEl.scrollHeight;
    });
  }

  function startElapsedTimer() {
    if (elapsedInterval) return;
    const start = Date.now();
    setElapsedMs(0);
    elapsedInterval = setInterval(() => setElapsedMs(Date.now() - start), 500);
  }

  function stopElapsedTimer() {
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
  }

  onMount(() => {
    // Visual-proof hook: `?route=splash&hold=1` parks the screen in
    // its `starting` state without firing the probe so Playwright can
    // capture the spinner mid-boot.
    const params = new URL(window.location.href).searchParams;
    if (params.get('hold') === '1') {
      setPhase('starting');
      return;
    }
    // Visual-proof hook for the first-run install view. `needs_install`
    // only ever occurs inside the Tauri shell, so the pure-web visual
    // harness can't reach it organically — this parks the splash in the
    // `installing` state with sample log lines for the screenshot.
    if (params.get('install') === 'demo') {
      setPhase('installing');
      setInstallLog([
        'Cloning iowarp/clio-agent@develop…',
        'Creating virtualenv at %LOCALAPPDATA%\\clio\\clio-agent\\.venv',
        'Resolving dependencies (142 packages)…',
        'Downloading torch-2.4.0 (797 MB)',
        '  ████████████████░░░░  72%  574 MB / 797 MB',
        'Installing collected packages: numpy, pydantic, fastapi, uvicorn…',
      ]);
      return;
    }
    if (inTauri()) {
      void waitForTauriBackend();
    } else {
      void probePureWebBackend();
    }
  });

  onCleanup(() => {
    cancelled = true;
    stopElapsedTimer();
    stopInstallEvents?.();
    stopInstallEvents = null;
  });

  async function waitForTauriBackend() {
    setPhase('starting');
    startElapsedTimer();
    const deadline = Date.now() + TAURI_MAX_WAIT_MS;
    while (!cancelled && Date.now() < deadline) {
      let handle: DesktopHandle;
      try {
        handle = await getBackend();
      } catch (e) {
        setPhase('error');
        setError(`Tauri bridge failed: ${describe(e)}`);
        return;
      }
      const status: BackendStatus = handle.status;
      if (status.kind === 'ready') {
        stopElapsedTimer();
        await handoff(handle.url, handle.bearer_token);
        return;
      }
      if (status.kind === 'needs_install') {
        // First run: clio-agent-gact isn't installed. Auto-run the upstream
        // installer (one swoop — no click) and switch to the install view.
        stopElapsedTimer();
        startInstall();
        return;
      }
      if (status.kind === 'error') {
        setPhase('error');
        setError(status.detail);
        return;
      }
      await sleep(TAURI_POLL_INTERVAL_MS);
    }
    if (!cancelled) {
      setPhase('error');
      setError(
        `Sidecar did not report ready within ${TAURI_MAX_WAIT_MS / 1000}s. ` +
          `Check the clio-agent-gact install (CLIO_REF=develop).`,
      );
    }
  }

  /**
   * One-swoop first-run install. Subscribes to the streamed installer
   * events FIRST (so no `clio:install-done` can race past the listener),
   * switches to the `installing` view, then kicks off `install_clio`.
   *
   * - progress line → append to the scrolling log pane.
   * - done → detach, re-poll the backend (the normal splash → chat
   *   transition takes over once clio resolves at its install prefix).
   * - failed → detach, fall back to the manual error card with the tail.
   */
  function startInstall(force = false) {
    setInstallLog([]);
    setError(null);
    setLogHint(null);
    setInstallFailed(false);
    setPhase('installing');
    cancelled = false;

    stopInstallEvents?.();
    stopInstallEvents = onInstallProgress({
      onLine: (line) => {
        if (!cancelled) appendInstallLine(line);
      },
      onDone: () => {
        stopInstallEvents?.();
        stopInstallEvents = null;
        if (cancelled) return;
        // clio is now installed; re-poll get_backend — the supervisor
        // resolves it at the conventional prefix on the next start.
        void waitForTauriBackend();
      },
      onFailed: (failure: InstallFailure) => {
        stopInstallEvents?.();
        stopInstallEvents = null;
        if (cancelled) return;
        setInstallFailed(true);
        setPhase('error');
        setError(installFailureMessage(failure, force));
      },
    });

    // Repair re-runs the installer with a force flag (rebuild a broken
    // runtime); first-run install does a plain install. Both stream over
    // the same events subscribed above.
    const run = force ? repairClio : installClio;
    void run().catch((e) => {
      stopInstallEvents?.();
      stopInstallEvents = null;
      if (cancelled) return;
      setInstallFailed(true);
      setPhase('error');
      setError(
        `${force ? 'Repair' : 'Auto-install'} couldn't start: ${describe(e)}`,
      );
    });
  }

  /**
   * Reveal the persisted boot log in the OS file manager. Best-effort: a
   * failure (no Tauri, or the log not written yet) shows an inline hint
   * rather than throwing — the manual install one-liner remains the
   * ultimate fallback.
   */
  async function openLogsAction() {
    setLogHint(null);
    try {
      const path = await openLogs();
      setLogHint(path ? `Opened ${path}` : 'Logs are only available in the desktop app.');
    } catch (e) {
      setLogHint(`Could not open logs: ${describe(e)}`);
    }
  }

  async function probePureWebBackend() {
    setPhase('probing');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PURE_WEB_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${PURE_WEB_DEFAULT_BACKEND}/v1/capabilities`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handoff(PURE_WEB_DEFAULT_BACKEND, '');
    } catch (e) {
      clearTimeout(timer);
      // No live backend on :7777 — fall back to the manual connect form
      // (only path where the user sees URL/token entry).
      if (!cancelled) {
        props.onWebFallbackNeeded();
      }
      void e;
    }
  }

  async function handoff(url: string, token: string) {
    try {
      const client = new Client({
        baseUrl: url,
        bearerToken: token || undefined,
        // Route through the Rust gact_http command when running inside
        // Tauri — the WebView's CORS layer blocks a direct fetch to a
        // sidecar that doesn't emit Access-Control-Allow-Origin.
        fetch: inTauri() ? tauriFetch : undefined,
        getLocale: getRequestLocale,
      });
      const caps: Capabilities = await client.capabilities();
      setPhase('ready');
      props.onReady({ url, bearerToken: token, capabilities: caps });
    } catch (e) {
      setPhase('error');
      setError(`capabilities probe failed: ${describe(e)}`);
    }
  }

  return (
    <div class="splash" data-testid="splash-screen">
      <main class="splash__main">
        <div class="splash__mark">C</div>
        <h1 class="splash__wordmark">CLIO Desktop</h1>
        <p class="splash__sub">Starting your local agent…</p>
        <Show when={loadIntro()}>
          <pre class="splash__intro" data-testid="splash-intro">
            {loadIntro()}
          </pre>
        </Show>

        <Show when={phase() === 'starting' || phase() === 'probing'}>
          <div class="splash__spinner" data-testid="splash-spinner" aria-hidden>
            <div class="splash__dot" />
            <div class="splash__dot" />
            <div class="splash__dot" />
          </div>
          <p class="splash__hint">
            {phase() === 'starting'
              ? 'Booting the bundled clio-agent…'
              : 'Looking for a backend on localhost:17800…'}
            <Show when={elapsedMs() > 1500}>
              <span class="splash__elapsed">
                {' · '}
                {Math.floor(elapsedMs() / 1000)}s
              </span>
            </Show>
          </p>
        </Show>

        <Show when={phase() === 'installing'}>
          <div class="splash__install" data-testid="splash-installing">
            <div class="splash__spinner" aria-hidden>
              <div class="splash__dot" />
              <div class="splash__dot" />
              <div class="splash__dot" />
            </div>
            <p class="splash__install-title">
              Setting up the CLIO agent backend (first run)
            </p>
            <p class="splash__install-note">
              This downloads the clio-agent Python packages (~800&nbsp;MB) and
              takes a few minutes. You only have to do this once.
            </p>
            <pre
              class="splash__install-log"
              data-testid="splash-install-log"
              ref={logPaneEl}
              aria-live="polite"
            >
              <For each={installLog()}>{(line) => <div>{line}</div>}</For>
            </pre>
          </div>
        </Show>

        <Show when={phase() === 'error'}>
          <div
            class="splash__error"
            data-testid={installFailed() ? 'splash-install-failed' : 'splash-error'}
          >
            <div class="splash__error-eyebrow">
              {installFailed() ? "Couldn't install CLIO" : "Couldn't start CLIO"}
            </div>
            <p class="splash__error-msg">{error()}</p>
            <p class="splash__error-hint">
              {installFailed()
                ? 'Automatic setup failed. You can retry, or install clio-agent manually and restart:'
                : 'Install '}
              <Show when={!installFailed()}>
                <code>clio-agent</code> from the develop branch and restart:
              </Show>
            </p>
            <code class="splash__cmd">{installRecipeForPlatform()}</code>
            <div class="splash__error-actions">
              <button
                type="button"
                class="splash__btn"
                onClick={() => {
                  if (installFailed()) {
                    // Retry the one-swoop install from scratch.
                    startInstall();
                    return;
                  }
                  // Retry = re-probe / re-spawn the EXISTING install.
                  setError(null);
                  setLogHint(null);
                  cancelled = false;
                  if (inTauri()) {
                    void waitForTauriBackend();
                  } else {
                    void probePureWebBackend();
                  }
                }}
                data-testid={installFailed() ? 'splash-install-retry' : 'splash-retry'}
              >
                Retry
              </button>
              {/* Repair = re-run the installer with --force to rebuild a
                  broken venv/runtime. Desktop-only (pure web has no
                  bundled runtime to repair). */}
              <Show when={inTauri()}>
                <button
                  type="button"
                  class="splash__btn splash__btn--ghost"
                  onClick={() => startInstall(true)}
                  data-testid="splash-repair"
                >
                  Repair install
                </button>
                <button
                  type="button"
                  class="splash__btn splash__btn--ghost"
                  onClick={() => void openLogsAction()}
                  data-testid="splash-open-logs"
                >
                  Open logs
                </button>
              </Show>
              <button
                type="button"
                class="splash__btn splash__btn--ghost"
                onClick={() => props.onWebFallbackNeeded()}
                data-testid="splash-manual-connect"
              >
                Manual connect…
              </button>
            </div>
            <Show when={logHint()}>
              <p class="splash__error-loghint" data-testid="splash-log-hint">
                {logHint()}
              </p>
            </Show>
          </div>
        </Show>
      </main>
    </div>
  );
}

/**
 * Render a friendly one-liner for a failed auto-install, appending the
 * exit code and the tail of the installer output when present.
 */
function installFailureMessage(failure: InstallFailure, force = false): string {
  const code =
    failure.code == null ? 'could not be launched' : `exited with code ${failure.code}`;
  const verb = force ? 'repair' : 'installer';
  const base = `The clio-agent ${verb} ${code}.`;
  const tail = failure.tail?.trim();
  return tail ? `${base}\n\n${tail}` : base;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Picks an install command appropriate for the user's OS so the error
 * panel doesn't show a PowerShell line to a macOS user (and vice
 * versa). The actual install scripts live in the clio-agent repo.
 */
function installRecipeForPlatform(): string {
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
