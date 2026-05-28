import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { Capabilities } from '@clio/core';
import { Client } from '@clio/core';
import type { BackendHandle as DesktopHandle, BackendStatus } from '../tauri.js';
import { getBackend, inTauri } from '../tauri.js';
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

  let cancelled = false;

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
  });

  async function waitForTauriBackend() {
    setPhase('starting');
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
      const client = new Client({ baseUrl: url, bearerToken: token || undefined });
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
      <div class="atmos-orb atmos-orb--warm" />
      <div class="atmos-orb atmos-orb--cool" />
      <div class="atmos-noise" />

      <main class="splash__main">
        <div class="splash__wordmark">CLIO</div>
        <div class="eyebrow splash__sub">Starting your local agent…</div>

        <Show when={phase() === 'starting' || phase() === 'probing'}>
          <div class="splash__spinner" data-testid="splash-spinner" aria-hidden>
            <div class="splash__dot" />
            <div class="splash__dot" />
            <div class="splash__dot" />
          </div>
          <div class="splash__hint">
            {phase() === 'starting'
              ? 'Booting the bundled clio-agent…'
              : 'Looking for a backend on localhost:7777…'}
          </div>
        </Show>

        <Show when={phase() === 'error'}>
          <div class="splash__error card" data-testid="splash-error">
            <div class="eyebrow">Couldn't start CLIO</div>
            <p class="splash__error-msg">{error()}</p>
            <p class="splash__error-hint">
              Install <code>clio-agent</code> from the develop branch and restart:
              <code class="splash__cmd">
                $env:CLIO_REF = 'develop'; irm
                https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex
              </code>
            </p>
          </div>
        </Show>

        <footer class="splash__footer">
          <span class="chip chip--ok">desktop primary</span>
          <span class="chip">web alongside</span>
        </footer>
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
