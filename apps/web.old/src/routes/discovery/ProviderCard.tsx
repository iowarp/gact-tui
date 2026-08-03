/**
 * Discovery surface: Provider Card component. Key export `ProviderCard`.
 */
import { Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import { ProviderModelsPanel } from './ProviderModelsPanel.js';
import {
  providerAuthMethodsLabel,
  providerAuthStatus,
  providerNeedsAuth,
  providerUseLabel,
} from './ProviderCardModel.js';

export function ProviderCard(props: {
  p: ProviderDef;
  isActive: boolean;
  busy: boolean;
  client: Client;
  onUse: () => void;
  onAuth: () => void;
}) {
  const authStatus = () => providerAuthStatus(props.p);

  return (
    <article class="dp__card" data-testid={`provider-card-${props.p.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="sparkle" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.p.name}</h3>
            <div class="dp__card-sub">{props.p.id}</div>
          </div>
        </div>
        <Show
          when={props.isActive}
          fallback={
            <span class={authStatus().className}>
              {authStatus().label}
            </span>
          }
        >
          <span class="dp__tag dp__tag--cyan">active</span>
        </Show>
      </header>
      <Show when={props.p.description}>
        <p class="dp__card-body">{props.p.description}</p>
      </Show>
      <dl class="dp__card-kv">
        <Show when={props.p.default_model}>
          <dt>default</dt>
          <dd>{props.p.default_model}</dd>
        </Show>
        <Show when={props.p.api_base}>
          <dt>endpoint</dt>
          <dd>{props.p.api_base}</dd>
        </Show>
        <Show when={props.p.auth_methods && props.p.auth_methods.length > 0}>
          <dt>auth</dt>
          <dd>{providerAuthMethodsLabel(props.p)}</dd>
        </Show>
      </dl>
      <ProviderModelsPanel p={props.p} client={props.client} />
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn dp__card-btn--primary"
          disabled={props.busy || props.isActive}
          onClick={props.onUse}
          data-testid={`provider-use-${props.p.id}`}
        >
          {providerUseLabel(props.isActive, props.busy)}
        </button>
        <Show when={providerNeedsAuth(props.p)}>
          <button
            type="button"
            class="dp__card-btn"
            disabled={props.busy}
            onClick={props.onAuth}
            data-testid={`provider-auth-${props.p.id}`}
          >
            re-authenticate
          </button>
        </Show>
      </div>
    </article>
  );
}
