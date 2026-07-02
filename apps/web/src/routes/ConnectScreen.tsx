/**
 * Connect route: backend URL/token entry and capabilities probe. Exports
 * {@link ConnectScreen}.
 */
import { createMemo, For, Show, type JSX } from 'solid-js';
import type { BackendEntry } from '@clio/core';
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import { Icon } from '../components/Icon.js';
import { BrandMark } from '../components/BrandMark.js';
import { useBackendRegistry } from '../registry.js';
import { createConnectScreenController } from './ConnectScreenController.js';
import { normalizedBackendBaseUrl } from './ConnectScreenModel.js';
import {
  pureWebBackendCandidates,
  type PureWebBackendCandidate,
} from './splashBackend.js';
import './connect.css';

export interface ConnectScreenProps {
  onConnected: (b: BackendHandle) => void;
}

export function ConnectScreen(props: ConnectScreenProps) {
  const connect = createConnectScreenController({ onConnected: props.onConnected });
  const registry = useBackendRegistry();
  const backendChoices = createMemo(() =>
    pureWebBackendCandidates(registry.state()).map((candidate) => ({
      ...candidate,
      savedBackend: candidateSavedBackend(candidate, registry.state().backends),
      label: candidateLabel(candidate, registry.state().backends),
    })).filter((choice) => choice.savedBackend),
  );
  const taglineAccent = () => brand.taglineAccent?.trim() || '';
  const taglineParts = () => {
    const accent = taglineAccent();
    if (!accent || !brand.tagline.includes(accent)) {
      return [{ text: brand.tagline, accent: false }];
    }
    const [before = '', after = ''] = brand.tagline.split(accent, 2);
    return [
      { text: before, accent: false },
      { text: accent, accent: true },
      { text: after, accent: false },
    ].filter((part) => part.text.length > 0);
  };

  return (
    <div class="connect" data-testid="connect-screen-bg">
      <main class="connect__main" data-testid="connect-screen">
        <div class="connect__brand">
          <BrandLink className="connect__mark-link" href={brand.homeUrl}>
            <BrandMark class="connect__mark" useImage />
          </BrandLink>
          <div class="connect__brand-copy">
            <BrandLink className="connect__wordmark" href={brand.homeUrl}>
              <For each={brand.wordmark.split('')}>
                {(char) => <span>{char}</span>}
              </For>
            </BrandLink>
            <Show when={brand.tagline}>
              <span class="connect__tagline">
                <For each={taglineParts()}>
                  {(part) => (
                    <Show
                      when={part.accent && brand.taglineAccentUrl}
                      fallback={<span>{part.text}</span>}
                    >
                      <a
                        class="connect__tagline-link"
                        href={brand.taglineAccentUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {part.text}
                      </a>
                    </Show>
                  )}
                </For>
              </span>
            </Show>
          </div>
        </div>
        <h1 class="connect__title">Connect to backend</h1>
        <p class="connect__lede">Choose a backend URL or retry.</p>

        <div class="connect__card">
          <div class="connect__choices" aria-label="Backend choices">
            <For each={backendChoices()}>
              {(choice) => (
                <div
                  class={
                    'connect__choice ' +
                    (normalizedBackendBaseUrl(connect.url()) ===
                    normalizedBackendBaseUrl(choice.url)
                      ? 'is-selected'
                      : '')
                  }
                  data-testid={`connect-choice-${normalizedBackendBaseUrl(choice.url).replace(/[^a-z0-9]+/gi, '-')}`}
                >
                  <button
                    type="button"
                    class="connect__choice-main"
                    onClick={() => {
                      connect.setUrl(choice.url);
                      connect.setToken(choice.token);
                    }}
                  >
                    <span class="connect__choice-label">{choice.label}</span>
                    <span class="connect__choice-url">{normalizedBackendBaseUrl(choice.url)}</span>
                  </button>
                  <Show when={choice.savedBackend}>
                    {(backend) => (
                      <button
                        type="button"
                        class="connect__choice-remove"
                        aria-label={`Remove ${backend().label}`}
                        title="Remove saved backend"
                        data-testid={`connect-choice-remove-${backend().id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          registry.remove(backend().id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </div>

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

function candidateLabel(
  candidate: PureWebBackendCandidate,
  savedBackends: readonly BackendEntry[],
): string {
  const saved = candidateSavedBackend(candidate, savedBackends);
  if (saved) return saved.label;
  const normalized = normalizedBackendBaseUrl(candidate.url);
  if (normalized.includes('127.0.0.1') || normalized.includes('localhost')) {
    return 'Local backend';
  }
  return 'Backend';
}

function candidateSavedBackend(
  candidate: PureWebBackendCandidate,
  savedBackends: readonly BackendEntry[],
): BackendEntry | undefined {
  const normalized = normalizedBackendBaseUrl(candidate.url);
  return savedBackends.find(
    (backend) =>
      normalizedBackendBaseUrl(backend.url) === normalized &&
      backend.bearerToken === candidate.token,
  );
}

function BrandLink(props: { className: string; href: string | null; children: JSX.Element }) {
  return (
    <Show
      when={props.href}
      fallback={<span class={props.className}>{props.children}</span>}
    >
      {(href) => (
        <a class={props.className} href={href()} target="_blank" rel="noreferrer">
          {props.children}
        </a>
      )}
    </Show>
  );
}
