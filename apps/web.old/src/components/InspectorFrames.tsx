/**
 * Inspector "Frames" tab: lists the session's context frames with their token
 * counts, status, and expandable per-frame item contents.
 */
import { createSignal, For, Show } from 'solid-js';
import type { ContextFrameItem } from '@clio/core';
import { Icon } from './Icon.js';

export interface ContextFrameRow {
  id: string;
  created_at?: string;
  status?: string;
  summary?: string;
  token_count?: number;
  items?: ContextFrameItem[];
}

/**
 * Pull the per-item inclusion list out of a frame row or its lazily-loaded
 * detail payload. The detail is an opaque `Record`; clio nests the assembled
 * items under `items`. Returns [] when none are present.
 */
export function frameItems(
  source: ContextFrameRow | Record<string, unknown> | string | undefined,
): ContextFrameItem[] {
  if (!source || typeof source === 'string') return [];
  const raw = (source as Record<string, unknown>).items;
  return Array.isArray(raw) ? (raw as ContextFrameItem[]) : [];
}

function itemSource(item: ContextFrameItem): string {
  return item.display_path ?? item.path ?? item.source_id ?? '';
}

function FrameItemRow(props: { item: ContextFrameItem }) {
  const included = () => props.item.included !== false;
  return (
    <li
      class={'inspector__frame-item ' + (included() ? '' : 'inspector__frame-item--excluded')}
      data-testid="inspector-frame-item"
    >
      <span
        class={'inspector__frame-item-pip ' + (included() ? 'is-in' : 'is-out')}
        title={included() ? 'included' : 'excluded'}
      />
      <span class="inspector__frame-item-kind">{props.item.kind ?? 'item'}</span>
      <Show when={itemSource(props.item)}>
        <span class="inspector__frame-item-src">{itemSource(props.item)}</span>
      </Show>
      <Show when={props.item.reason}>
        <span class="inspector__frame-item-reason" title={props.item.reason}>
          {props.item.reason}
        </span>
      </Show>
      <Show when={typeof props.item.tokens_estimated === 'number'}>
        <span class="inspector__frame-item-tokens">{props.item.tokens_estimated}t</span>
      </Show>
    </li>
  );
}

/** Frames tab: rows expand and lazy-load a single frame's full payload. */
export function FramesTab(props: {
  frames: ContextFrameRow[];
  onLoadDetail?: (frameId: string) => Promise<Record<string, unknown>>;
}) {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [details, setDetails] = createSignal<Record<string, Record<string, unknown> | string>>({});

  async function toggle(id: string) {
    const cur = new Set(expanded());
    if (cur.has(id)) {
      cur.delete(id);
    } else {
      cur.add(id);
      if (props.onLoadDetail && !details()[id]) {
        try {
          const d = await props.onLoadDetail(id);
          setDetails({ ...details(), [id]: d });
        } catch (e) {
          setDetails({
            ...details(),
            [id]: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    setExpanded(cur);
  }

  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Context frames ({props.frames.length})</div>
      <ul class="inspector__frames">
        <For each={props.frames}>
          {(f) => (
            <li
              class={'inspector__frame inspector__frame--' + (f.status ?? 'unknown')}
              data-testid={`inspector-frame-${f.id}`}
            >
              <button
                type="button"
                class="inspector__frame-head inspector__frame-head--clickable"
                onClick={() => void toggle(f.id)}
                data-testid={`inspector-frame-toggle-${f.id}`}
              >
                <Icon
                  name="chevron-right"
                  size={11}
                  class={'inspector__frame-chev ' + (expanded().has(f.id) ? 'is-open' : '')}
                />
                <span class="inspector__frame-id">{f.id.slice(0, 12)}</span>
                <Show when={f.status}>
                  <span class="inspector__chip">{f.status}</span>
                </Show>
                <Show when={typeof f.token_count === 'number'}>
                  <span class="inspector__frame-tokens">{f.token_count}t</span>
                </Show>
              </button>
              <Show when={f.summary}>
                <div class="inspector__frame-summary">{f.summary}</div>
              </Show>
              <Show when={expanded().has(f.id)}>
                {(() => {
                  // Prefer items already on the row; otherwise read them from
                  // the lazily-loaded detail payload.
                  const items = () =>
                    frameItems(f).length > 0 ? frameItems(f) : frameItems(details()[f.id]);
                  return (
                    <Show
                      when={details()[f.id] || f.items}
                      fallback={<div class="inspector__frame-loading">Loading...</div>}
                    >
                      <Show when={items().length > 0}>
                        <ul class="inspector__frame-items" data-testid={`inspector-frame-items-${f.id}`}>
                          <For each={items()}>{(it) => <FrameItemRow item={it} />}</For>
                        </ul>
                      </Show>
                      <Show when={details()[f.id]}>
                        <details class="inspector__frame-raw">
                          <summary>Raw frame</summary>
                          <pre class="inspector__frame-payload">
                            {typeof details()[f.id] === 'string'
                              ? (details()[f.id] as string)
                              : JSON.stringify(details()[f.id], null, 2)}
                          </pre>
                        </details>
                      </Show>
                    </Show>
                  );
                })()}
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
