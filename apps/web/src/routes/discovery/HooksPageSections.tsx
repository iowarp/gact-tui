/**
 * Discovery surface: Hooks Page Sections component. Key export `HooksRuntimePanelProps`.
 */
import { For, Show } from 'solid-js';
import type { HookEvent, HookRow } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import { HOOK_EVENTS, type HookHandlerKind } from './HooksPageModel.js';

export interface HooksRuntimePanelProps {
  runtimeBackend: string;
  runtimeEvents: Record<string, number>;
}

export function HooksRuntimePanel(props: HooksRuntimePanelProps) {
  const hasRuntimeBackend = () =>
    props.runtimeBackend !== 'none' && props.runtimeBackend !== 'unavailable';

  return (
    <section class="rmp__panel" data-testid="hooks-runtime-panel">
      <header class="rmp__panel-head">
        <h2 class="rmp__panel-title">Loaded hooks</h2>
        <span class="rmp__panel-note">active for this backend, read-only</span>
      </header>
      <div class="rmp__panel-row">
        <span class="rmp__panel-label">backend</span>
        <code
          class={
            'rmp__panel-backend' + (!hasRuntimeBackend() ? ' rmp__panel-backend--off' : '')
          }
          data-testid="hooks-runtime-backend"
        >
          {props.runtimeBackend}
        </code>
      </div>
      <Show when={hasRuntimeBackend()}>
        <div class="rmp__panel-chips">
          <For each={HOOK_EVENTS}>
            {(evt) => {
              const count = () => props.runtimeEvents[evt] ?? 0;
              return (
                <span
                  class={'rmp__chip' + (count() === 0 ? ' rmp__chip--muted' : '')}
                  data-testid={`hooks-runtime-count-${evt}`}
                >
                  {evt} × {count()}
                </span>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}

export interface HooksSavedPanelProps {
  items: HookRow[];
  loading: boolean;
  error: string | null;
  onRemove: (id: string) => void;
}

export function HooksSavedPanel(props: HooksSavedPanelProps) {
  return (
    <>
      <h2 class="dp__section-title">Saved hooks</h2>
      <Show when={!props.loading && props.items.length === 0 && !props.error}>
        <div class="dp__empty" data-testid="hooks-empty-hint" style="padding-block: 16px">
          <div class="dp__empty-icon">
            <Icon name="tool" size={28} />
          </div>
          <h2 class="dp__empty-title">No saved hooks</h2>
          <p class="dp__empty-body">
            This backend can store event-triggered commands or webhooks. The loaded hooks above are
            the ones that currently run during turns.
          </p>
        </div>
      </Show>
      <ul class="rmp__list" data-testid="hooks-list">
        <For each={props.items}>
          {(h) => (
            <li class="rmp__row" data-testid={`hook-${h.id}`}>
              <span class={'rmp__tag rmp__tag--' + h.event}>{h.event}</span>
              <span class="rmp__name">{h.id}</span>
              <code class="rmp__uri">{h.command || h.url}</code>
              <button
                type="button"
                class="rmp__row-x"
                title="Delete hook"
                aria-label={`Delete hook ${h.id}`}
                onClick={() => props.onRemove(h.id)}
                data-testid={`hook-delete-${h.id}`}
              >
                <Icon name="close" size={10} />
              </button>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}

export interface HooksCreateFormProps {
  event: HookEvent;
  handlerKind: HookHandlerKind;
  value: string;
  busy: boolean;
  error: string | null;
  onEventChange: (event: HookEvent) => void;
  onHandlerKindChange: (kind: HookHandlerKind) => void;
  onValueChange: (value: string) => void;
  onSubmit: (ev: SubmitEvent) => void;
}

export function HooksCreateForm(props: HooksCreateFormProps) {
  return (
    <>
      <form class="rmp__form rmp__form--hooks" onSubmit={props.onSubmit} data-testid="hook-form">
        <select
          class="rmp__form-select"
          value={props.event}
          onChange={(e) => props.onEventChange(e.currentTarget.value as HookEvent)}
          data-testid="hook-event"
        >
          <For each={HOOK_EVENTS}>{(evt) => <option value={evt}>{evt}</option>}</For>
        </select>
        <select
          class="rmp__form-select"
          value={props.handlerKind}
          onChange={(e) => props.onHandlerKindChange(e.currentTarget.value as HookHandlerKind)}
          data-testid="hook-handler-kind"
        >
          <option value="command">command</option>
          <option value="url">url</option>
        </select>
        <input
          class="rmp__form-input"
          type="text"
          placeholder={
            props.handlerKind === 'url' ? 'http://localhost:9999/hook' : './scripts/on-hook.sh'
          }
          value={props.value}
          onInput={(e) => props.onValueChange(e.currentTarget.value)}
          data-testid="hook-value"
        />
        <button
          type="submit"
          class="rmp__form-add"
          disabled={props.busy || !props.value.trim()}
          data-testid="hook-add"
        >
          <Icon name="plus" size={12} />
          <span>{props.busy ? 'Adding…' : 'Add'}</span>
        </button>
      </form>
      <Show when={props.error}>
        <p class="rmp__form-err">{props.error}</p>
      </Show>
    </>
  );
}
