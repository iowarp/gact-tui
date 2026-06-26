/**
 * Connect route: backend URL/token entry and capabilities probe. Exports
 * {@link ConnectScreen}.
 */
import { Show } from 'solid-js';
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import { Icon } from '../components/Icon.js';
import { BrandMark } from '../components/BrandMark.js';
import { createConnectScreenController } from './ConnectScreenController.js';
import './connect.css';

export interface ConnectScreenProps {
  onConnected: (b: BackendHandle) => void;
}

export function ConnectScreen(props: ConnectScreenProps) {
  const connect = createConnectScreenController({ onConnected: props.onConnected });

  return (
    <div class="connect" data-testid="connect-screen-bg">
      <main class="connect__main" data-testid="connect-screen">
        <div class="connect__brand">
          <BrandMark class="connect__mark" />
          <span class="connect__wordmark">{brand.wordmark}</span>
        </div>
        <h1 class="connect__title">Welcome to {brand.name}</h1>
        <p class="connect__lede">
          {brand.tagline ? brand.tagline + '. ' : ''}Connect to get started —
          it defaults to the local backend running on this machine.
        </p>

        <div class="connect__card">
          <div class="field">
            <label for="conn-url">Backend URL</label>
            <input
              id="conn-url"
              type="url"
              value={connect.url()}
              onInput={(e) => connect.setUrl(e.currentTarget.value)}
              placeholder="http://127.0.0.1:17800"
              data-testid="connect-url"
              autocomplete="off"
              spellcheck={false}
            />
          </div>

          <button
            type="button"
            class="connect__advanced-toggle"
            aria-expanded={connect.showAdvanced()}
            onClick={() => connect.setShowAdvanced((v) => !v)}
            data-testid="connect-advanced-toggle"
          >
            <Icon
              name="chevron-right"
              size={11}
              class={'connect__advanced-chev ' + (connect.showAdvanced() ? 'is-open' : '')}
            />
            <span>Advanced</span>
          </button>

          <Show when={connect.showAdvanced()}>
            <div class="field connect__advanced">
              <label for="conn-token">
                Bearer token{' '}
                <span class="connect__hint-inline">
                  (skip when the backend uses trust_socket on localhost)
                </span>
              </label>
              <input
                id="conn-token"
                ref={connect.setTokenInputRef}
                type="password"
                value={connect.token()}
                onInput={(e) => connect.setToken(e.currentTarget.value)}
                placeholder="paste a token issued by your backend …"
                data-testid="connect-token"
                autocomplete="off"
                spellcheck={false}
              />
            </div>
          </Show>

          <Show when={connect.error()}>
            <div class="connect__error" data-testid="connect-error">
              <Icon name="help" size={14} />
              <span>
                {connect.error()}
                <span class="connect__error-hint">{connect.errorHint()}</span>
              </span>
            </div>
          </Show>

          {/* Remote-backend auth failure: offer a credentials re-entry
              action (bearer / SSH token) instead of leaving a bare 401/403.
              Scoped to remote hosts only — the local backend's model-provider
              token is maintained externally and is never re-auth'd here. */}
          <Show when={connect.reauthNeeded()}>
            <div class="connect__reauth" data-testid="connect-reauth">
              <span class="connect__reauth-msg">
                This remote backend rejected your credentials. Sign in again
                with a fresh token.
              </span>
              <button
                type="button"
                class="connect__reauth-btn"
                onClick={connect.reenterCredentials}
                data-testid="splash-reauth"
              >
                Re-enter credentials
              </button>
            </div>
          </Show>

          <div class="connect__actions">
            <button
              type="button"
              class="connect__submit"
              onClick={connect.tryConnect}
              disabled={connect.status() === 'connecting'}
              data-testid="connect-submit"
            >
              <Show
                when={connect.status() === 'connecting'}
                fallback={
                  <>
                    Connect
                    <Icon name="arrow-up-right" size={14} />
                  </>
                }
              >
                Connecting…
              </Show>
            </button>
            <span class="connect__privacy">no telemetry · stays on this box</span>
          </div>
        </div>
      </main>
    </div>
  );
}
