/**
 * Splash/startup screen: backend startup, install flow and status panels.
 * Exports {@link SplashScreen}.
 */
import { Show } from 'solid-js';
import { brand } from '@brand';
import { BrandMark } from '../components/BrandMark.js';
import { inTauri } from '../tauri.js';
import type { BackendHandle as FrontendHandle } from '../App.js';
import { useBackendRegistry } from '../registry.js';
import { createSplashController } from './splashController.js';
import { pureWebBackendCandidates } from './splashBackend.js';
import { SplashErrorPanel, SplashInstallPanel, SplashProbePanel } from './SplashStatusPanels.js';
import './splash.css';

export { SPLASH_INTRO_KEY } from './splashModel.js';

/**
 * Splash screen — the front door for both the Tauri shell and the
 * pure-web build.
 *
 * - In Tauri: polls `get_backend` until status flips from `starting`
 *   to `ready` (or `error`). The bundled clio-agent-gact sidecar is
 *   already spawning in the Rust supervisor; we just wait.
 * - In a pure browser: probes the default backend's `/v1/capabilities`
 *   directly (backendDefaults.ts, clio on :17800). If it answers,
 *   transition to chat. If not, surface a
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

export function SplashScreen(props: SplashScreenProps) {
  const registry = useBackendRegistry();
  const controller = createSplashController({
    ...props,
    pureWebCandidates: () => pureWebBackendCandidates(registry.state()),
    isRegistryHydrated: registry.hydrated,
  });

  return (
    <div class="splash" data-testid="splash-screen">
      <main class="splash__main">
        <BrandMark class="splash__mark" useImage />
        <h1 class="splash__wordmark">
          {brand.name}
          <Show when={inTauri()}> Desktop</Show>
        </h1>
        <p class="splash__sub">Starting your local agent…</p>
        <Show when={controller.intro}>
          <pre class="splash__intro" data-testid="splash-intro">
            {controller.intro}
          </pre>
        </Show>

        <SplashProbePanel phase={controller.phase} elapsedMs={controller.elapsedMs} />
        <SplashInstallPanel
          phase={controller.phase}
          installLog={controller.installLog}
          setLogPaneRef={controller.setLogPaneRef}
        />
        <SplashErrorPanel
          phase={controller.phase}
          error={controller.error}
          installFailed={controller.installFailed}
          logHint={controller.logHint}
          bootLog={controller.bootLog}
          logCopied={controller.logCopied}
          onRetry={controller.retryFromError}
          onRepair={controller.repair}
          onOpenLogs={() => void controller.openLogsAction()}
          onCopyLogs={() => void controller.copyLogs()}
          onManualConnect={() => props.onWebFallbackNeeded()}
        />
      </main>
    </div>
  );
}
