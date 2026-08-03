/**
 * UI component: Discovery Page. Renders `DiscoveryPage` from `DiscoveryPageProps`.
 */
import { Show, type JSX } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import './discovery-page.css';

export interface DiscoveryPageProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Right-side action slot (e.g. refresh, add). */
  actions?: JSX.Element;
  loading?: boolean;
  error?: string | null;
  /** Called when the user clicks Retry in the error state — wire it to the
   * page's refetch so a failed fetch is never a dead-end. */
  onRetry?: () => void;
  /** Optional empty-state message when content is empty (caller decides). */
  emptyTitle?: string;
  emptyBody?: string;
  empty?: boolean;
  children?: JSX.Element;
}

export function DiscoveryPage(props: DiscoveryPageProps) {
  return (
    <section class="dp" data-testid={`dp-${props.title.toLowerCase().replace(/\s+/g, '-')}`}>
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name={props.icon} size={20} />
          </div>
          <div>
            <h1 class="dp__title">{props.title}</h1>
            <Show when={props.subtitle}>
              <p class="dp__subtitle">{props.subtitle}</p>
            </Show>
          </div>
        </div>
        <Show when={props.actions}>
          <div class="dp__actions">{props.actions}</div>
        </Show>
      </header>

      <Show when={props.loading}>
        {/* Content-shaped skeleton (W3 Tier-1) — mirrors the card grid the
            data will land in, instead of a context-free spinner. */}
        <div class="dp__loading" data-testid="dp-loading">
          <div class="dp__skeleton-grid" aria-hidden="true">
            <div class="skeleton dp__skeleton-card" />
            <div class="skeleton dp__skeleton-card" />
            <div class="skeleton dp__skeleton-card" />
            <div class="skeleton dp__skeleton-card" />
            <div class="skeleton dp__skeleton-card" />
            <div class="skeleton dp__skeleton-card" />
          </div>
          <span class="dp__loading-label">Loading…</span>
        </div>
      </Show>

      <Show when={!props.loading && props.error}>
        <div class="dp__error" data-testid="dp-error">
          <Icon name="close" size={14} />
          <span>{props.error}</span>
          <Show when={props.onRetry}>
            <button
              type="button"
              class="dp__error-retry"
              data-testid="dp-error-retry"
              onClick={() => props.onRetry?.()}
            >
              Retry
            </button>
          </Show>
        </div>
      </Show>

      <Show when={!props.loading && !props.error && props.empty}>
        <div class="dp__empty">
          <div class="dp__empty-icon">
            <Icon name={props.icon} size={28} />
          </div>
          <h2 class="dp__empty-title">{props.emptyTitle ?? 'Nothing here yet'}</h2>
          <p class="dp__empty-body">{props.emptyBody ?? ''}</p>
        </div>
      </Show>

      <Show when={!props.loading && !props.error && !props.empty}>
        <div class="dp__body">{props.children}</div>
      </Show>
    </section>
  );
}
