import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { Capabilities } from '@clio/core';
import { Client } from '@clio/core';
import type { BackendHandle as DesktopHandle, BackendStatus } from '../tauri.js';
import { getRequestLocale } from '../locale.js';
import { getBackend, inTauri, tauriFetch } from '../tauri.js';

export const SPLASH_INTRO_KEY = 'clio.splash.intro.v1';

function loadIntro(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(SPLASH_INTRO_KEY) ?? '';
  } catch {
    return '';
  }
}
import { Icon } from '../components/Icon.js';
import type { BackendHandle as FrontendHandle } from '../App.js';
import './splash.css';

/**
 * Splash screen — the front door for both the Tauri shell and the
 * pure-web build.
 *
 * - In Tauri: polls `get_backend` until status flips from `starting`
 *   to `ready` (or `error`). The bundled clio-agent-gact sidecar is
 *   already spawning in the Rust supervisor; we just wait.
 * - In a pure browser: probes `http://localhost:7777/v1/capabilities`
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

const PURE_WEB_DEFAULT_BACKEND = 'http://localhost:7777';
const PURE_WEB_PROBE_TIMEOUT_MS = 2_500;
const TAURI_POLL_INTERVAL_MS = 250;
const TAURI_MAX_WAIT_MS = 30_000;

export function SplashScreen(props: SplashScreenProps) {
  const [phase, setPhase] = createSignal<
    'starting' | 'probing' | 'error' | 'ready'
  >('starting');
  const [error, setError] = createSignal<string | null>(null);
  const [elapsedMs, setElapsedMs] = createSignal(0);

  let cancelled = false;
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;

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
    if (inTauri()) {
      void waitForTauriBackend();
    } else {
      void probePureWebBackend();
    }
  });

  onCleanup(() => {
    cancelled = true;
    stopElapsedTimer();
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
        <div class="splash__badge">
          <Icon name="sparkle" size={32} />
        </div>
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
              : 'Looking for a backend on localhost:7777…'}
            <Show when={elapsedMs() > 1500}>
              <span class="splash__elapsed">
                {' · '}
                {Math.floor(elapsedMs() / 1000)}s
              </span>
            </Show>
          </p>
        </Show>

        <Show when={phase() === 'error'}>
          <div class="splash__error" data-testid="splash-error">
            <div class="splash__error-eyebrow">Couldn't start CLIO</div>
            <p class="splash__error-msg">{error()}</p>
            <p class="splash__error-hint">
              Install <code>clio-agent</code> from the develop branch and restart:
            </p>
            <code class="splash__cmd">{installRecipeForPlatform()}</code>
            <div class="splash__error-actions">
              <button
                type="button"
                class="splash__btn"
                onClick={() => {
                  setError(null);
                  cancelled = false;
                  if (inTauri()) {
                    void waitForTauriBackend();
                  } else {
                    void probePureWebBackend();
                  }
                }}
                data-testid="splash-retry"
              >
                Retry
              </button>
              <button
                type="button"
                class="splash__btn splash__btn--ghost"
                onClick={() => props.onWebFallbackNeeded()}
                data-testid="splash-manual-connect"
              >
                Manual connect…
              </button>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
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
