/**
 * Status panels for the splash screen (probe, install, error states).
 */
import { For, Show, type Accessor } from 'solid-js';
import { brand } from '@brand';
import { inTauri } from '../tauri.js';
import { installRecipeForPlatform, type SplashPhase } from './splashModel.js';

export function SplashProbePanel(props: {
  phase: Accessor<SplashPhase>;
  elapsedMs: Accessor<number>;
}) {
  return (
    <Show when={props.phase() === 'starting' || props.phase() === 'probing'}>
      <div class="splash__spinner" data-testid="splash-spinner" aria-hidden>
        <div class="splash__dot" />
        <div class="splash__dot" />
        <div class="splash__dot" />
      </div>
      <p class="splash__hint">
        {props.phase() === 'starting'
          ? 'Booting the bundled agent backend…'
          : 'Looking for a backend on localhost:17800…'}
        <Show when={props.elapsedMs() > 1500}>
          <span class="splash__elapsed">
            {' · '}
            {Math.floor(props.elapsedMs() / 1000)}s
          </span>
        </Show>
      </p>
    </Show>
  );
}

export function SplashInstallPanel(props: {
  phase: Accessor<SplashPhase>;
  installLog: Accessor<string[]>;
  setLogPaneRef: (el: HTMLPreElement) => void;
}) {
  return (
    <Show when={props.phase() === 'installing'}>
      <div class="splash__install" data-testid="splash-installing">
        <div class="splash__spinner" aria-hidden>
          <div class="splash__dot" />
          <div class="splash__dot" />
          <div class="splash__dot" />
        </div>
        <p class="splash__install-title">Setting up the {brand.name} agent backend (first run)</p>
        <p class="splash__install-note">
          This downloads the backend Python packages (~800&nbsp;MB) and takes a few minutes. You
          only have to do this once.
        </p>
        <pre
          class="splash__install-log"
          data-testid="splash-install-log"
          ref={props.setLogPaneRef}
          aria-live="polite"
        >
          <For each={props.installLog()}>{(line) => <div>{line}</div>}</For>
        </pre>
      </div>
    </Show>
  );
}

export function SplashErrorPanel(props: {
  phase: Accessor<SplashPhase>;
  error: Accessor<string | null>;
  installFailed: Accessor<boolean>;
  logHint: Accessor<string | null>;
  onRetry: () => void;
  onRepair: () => void;
  onOpenLogs: () => void;
  onManualConnect: () => void;
}) {
  return (
    <Show when={props.phase() === 'error'}>
      <div
        class="splash__error"
        data-testid={props.installFailed() ? 'splash-install-failed' : 'splash-error'}
      >
        <div class="splash__error-eyebrow">
          {props.installFailed()
            ? `Couldn't install ${brand.name}`
            : `Couldn't start ${brand.name}`}
        </div>
        <p class="splash__error-msg">{props.error()}</p>
        <p class="splash__error-hint">
          {props.installFailed()
            ? 'Automatic setup failed. You can retry, or install the backend manually and restart:'
            : 'Install '}
          <Show when={!props.installFailed()}>
            the backend from the develop branch and restart:
          </Show>
        </p>
        <code class="splash__cmd">{installRecipeForPlatform()}</code>
        <div class="splash__error-actions">
          <button
            type="button"
            class="splash__btn"
            onClick={props.onRetry}
            data-testid={props.installFailed() ? 'splash-install-retry' : 'splash-retry'}
          >
            Retry
          </button>
          <Show when={inTauri()}>
            <button
              type="button"
              class="splash__btn splash__btn--ghost"
              onClick={props.onRepair}
              data-testid="splash-repair"
            >
              Repair install
            </button>
            <button
              type="button"
              class="splash__btn splash__btn--ghost"
              onClick={props.onOpenLogs}
              data-testid="splash-open-logs"
            >
              Open logs
            </button>
          </Show>
          <button
            type="button"
            class="splash__btn splash__btn--ghost"
            onClick={props.onManualConnect}
            data-testid="splash-manual-connect"
          >
            Manual connect…
          </button>
        </div>
        <Show when={props.logHint()}>
          <p class="splash__error-loghint" data-testid="splash-log-hint">
            {props.logHint()}
          </p>
        </Show>
      </div>
    </Show>
  );
}
