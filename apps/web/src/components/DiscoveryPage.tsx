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
        <div class="dp__loading" data-testid="dp-loading">
          <div class="dp__spinner" />
          <span>Loading…</span>
        </div>
      </Show>

      <Show when={!props.loading && props.error}>
        <div class="dp__error" data-testid="dp-error">
          <Icon name="close" size={14} />
          <span>{props.error}</span>
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
