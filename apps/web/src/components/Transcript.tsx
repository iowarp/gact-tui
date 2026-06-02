import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { FileDiff, Message, Part } from '@clio/core';
import { Icon, type IconName } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import type { ModelOption } from './Composer.js';
import './transcript.css';
import './inline-markdown.css';

export type TranscriptDensity = 'verbose' | 'normal' | 'summary';

export interface TranscriptProps {
  messages: Message[];
  /** True while the message list is loading (session switch) — renders
   * skeleton bubbles instead of a blank pane (W3 Tier-1). */
  loading?: boolean;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  /** Optional per-message action callbacks. Wired in LiveDriven mode. */
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  /** Retry variants (1.0 item 4). When either is provided the Regenerate
   * button opens a variant menu instead of firing immediately; clio's
   * retry route accepts `notes` and `provider_id`/`model_id` overrides. */
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  /** Available models for the "Regenerate with model" submenu. */
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  /** Currently-focused message id (drives the Inspector). */
  selectedId?: string;
  onSelect?: (msg: Message) => void;
  /** Cmd+F highlight state. */
  searchQuery?: string;
  /** Match identifier "<message_id>:<index>" pointing at the focused hit. */
  currentMatchKey?: string;
  /** When true, the last text part of the last assistant message renders a streaming cursor. */
  streaming?: boolean;
  /** When set, assistant messages render a Speak button that pulls
   * TTS audio from POST /v1/sessions/{id}/voice/synthesize. */
  onSpeak?: (msg: Message) => void | Promise<void>;
  /** When set, renders a copy-link action that calls back with the
   * message id; ChatScreen wraps it into a `clio://session/<sid>#<mid>`
   * permalink and writes to the clipboard. */
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  /** The scrollable ancestor (ChatScreen's `chat__pane`). Required for
   * virtual windowing of very large transcripts (1.0 item 6) — without it
   * (or below the threshold) every message renders, exactly as before. */
  scrollEl?: HTMLElement;
}

// ---- Virtual windowing (1.0 item 6) ----
// Past this many messages only the on-screen slice (+ buffer) renders;
// spacer divs preserve the scroll geometry so the scrollbar, autoscroll
// and jump-to-bottom keep working. Below the threshold behavior is
// byte-identical to the original full render.
const VIRTUAL_THRESHOLD = 150;
const VIRTUAL_BUFFER = 10;
const EST_HEIGHT = 132;
/** Flex gap between .trx children — included in per-message height. */
const TRX_GAP = 24;

const ROLE_ICON: Record<string, IconName> = {
  user: 'user',
  assistant: 'bot',
  system: 'help',
  tool: 'tool',
};

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'CLIO',
  system: 'System',
  tool: 'Tool',
};

function shouldRenderPart(part: Part, density: TranscriptDensity): boolean {
  if (density === 'verbose') return true;
  if (density === 'summary') {
    // summary keeps the answer + diffs + images; the routing breadcrumb
    // is useful but not load-bearing for read-back.
    return (
      part.type === 'text' || part.type === 'file_diff' || part.type === 'image'
    );
  }
  // normal density: hide thinking; show routing_decision so the user
  // can see which expert handled the turn.
  return part.type !== 'thinking';
}

function PartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  searchQuery?: string;
  messageId?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  showCursor?: boolean;
}) {
  const p = props.part;
  if (p.type === 'text') {
    const text = p.text ?? '';
    const q = props.searchQuery?.trim() ?? '';
    if (!q) {
      return (
        <div class="trx-text">
          <InlineMarkdown text={text} />
          <Show when={props.showCursor}>
            <span class="trx-cursor" aria-hidden>▌</span>
          </Show>
        </div>
      );
    }
    // When searching, prefer the highlight renderer over markdown
    // formatting — keeps the <mark> wrapping correct without having
    // to teach InlineMarkdown about search.
    return (
      <div class="trx-text">
        <HighlightedText
          text={text}
          query={q}
          messageId={props.messageId ?? ''}
          baseIndex={props.matchBaseIndex ?? 0}
          currentMatchKey={props.currentMatchKey ?? ''}
        />
        <Show when={props.showCursor}>
          <span class="trx-cursor" aria-hidden>▌</span>
        </Show>
      </div>
    );
  }
  if (p.type === 'thinking') {
    const body = p.thinking ?? p.text ?? '';
    const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
    const label = wordCount > 0
      ? `Thought for ~${wordCount} word${wordCount === 1 ? '' : 's'}`
      : 'Thinking';
    return (
      <details class="trx-thinking">
        <summary>
          <Icon name="sparkle" size={12} />
          <span>{label}</span>
          <span class="trx-thinking__hint">click to expand</span>
        </summary>
        <pre>{body}</pre>
      </details>
    );
  }
  if (p.type === 'tool_call') {
    if (props.density === 'normal') {
      return (
        <div
          class="trx-toolcall trx-toolcall--collapsed"
          data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
        >
          <Icon name="tool" size={14} class="trx-toolcall__icon" />
          <span class="trx-toolcall__name">{p.tool_name}</span>
          <span class="trx-toolcall__args">
            ({Object.keys(p.input ?? {}).slice(0, 2).join(', ')})
          </span>
        </div>
      );
    }
    return (
      <div
        class="trx-toolcall"
        data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
      >
        <Icon name="tool" size={14} class="trx-toolcall__icon" />
        <div style="flex:1; min-width:0">
          <div>
            <span class="trx-toolcall__name">{p.tool_name}</span>
          </div>
          <pre class="trx-toolcall__body">{JSON.stringify(p.input ?? {}, null, 2)}</pre>
        </div>
      </div>
    );
  }
  if (p.type === 'tool_result') {
    const body = (() => {
      if (typeof p.output === 'string') return p.output;
      if (Array.isArray(p.content)) {
        return p.content
          .map((c) => {
            if (c.type === 'text') return c.text;
            if (c.type === 'tool_result') return typeof c.output === 'string' ? c.output : '';
            return `[${c.type}]`;
          })
          .join('\n');
      }
      return '';
    })();
    return (
      <div class={'trx-toolresult ' + (p.is_error ? 'trx-toolresult--err' : '')}>
        <Icon name="check" size={14} class="trx-toolresult__icon" />
        <pre>{body}</pre>
      </div>
    );
  }
  if (p.type === 'file_diff') {
    const path = p.path;
    const stats = (() => {
      const ud = p.unified_diff ?? '';
      if (ud) {
        const adds = ud.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
        const dels = ud.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
        return { adds, dels };
      }
      const beforeLines = (p.before ?? '').split('\n').length;
      const afterLines = (p.after ?? '').split('\n').length;
      const adds = Math.max(0, afterLines - beforeLines);
      const dels = Math.max(0, beforeLines - afterLines);
      return { adds, dels };
    })();
    return (
      <div class="trx-filediff-wrap">
        <button
          type="button"
          class="trx-filediff"
          data-testid="filediff-chip"
          onClick={() => props.onOpenDiff?.(p)}
        >
          <Icon name="diff" size={14} />
          <div class="trx-filediff__chip">
            <span class="trx-filediff__path">{path}</span>
            <span class="trx-filediff__stats">
              <span class="trx-filediff__plus">+{stats.adds}</span>
              <span class="trx-filediff__minus">−{stats.dels}</span>
            </span>
          </div>
        </button>
        <Show when={props.onPinFile}>
          <button
            type="button"
            class="trx-filediff-pin"
            data-testid={`filediff-pin-${path}`}
            title="Pin this file to session context"
            onClick={() => props.onPinFile?.(path)}
          >
            <Icon name="pin" size={12} />
          </button>
        </Show>
      </div>
    );
  }
  // routing_decision parts — show clio's chosen expert + rationale so
  // the user can see why a particular tool/expert handled the turn.
  // Matches the TUI's detail_view rendering.
  if (p.type === 'routing_decision') {
    const selected = (p as Part & { selected_agent?: string }).selected_agent ?? '';
    const rationale = (p as Part & { rationale?: string }).rationale ?? '';
    const metadata = (p as Part & { metadata?: Record<string, unknown> }).metadata ?? {};
    const reason = String(metadata['route_reason'] ?? '');
    const source = String(metadata['route_source'] ?? '');
    return (
      <div class="trx-routing">
        <span class="trx-routing__icon" aria-hidden>
          <Icon name="branch" size={11} />
        </span>
        <span class="trx-routing__body">
          <span class="trx-routing__head">
            routed to <strong>{selected || 'chat'}</strong>
            <Show when={source}>
              <span class="trx-routing__src"> · {source}</span>
            </Show>
          </span>
          <Show when={rationale || reason}>
            <span class="trx-routing__why">{rationale || reason}</span>
          </Show>
        </span>
      </div>
    );
  }
  // expert_handoff parts — clio delegated the turn to a sub-expert; show
  // who handled it + the status/summary. (clio emits this as a Part, not a
  // standalone event, so it must be rendered here or it's silently dropped.)
  if (p.type === 'expert_handoff') {
    const hp = p as Part & { metadata?: Record<string, unknown>; text?: string };
    const meta = hp.metadata ?? {};
    const agent = String(meta['agent_id'] ?? meta['expert'] ?? 'expert');
    const parent = String(meta['parent_id'] ?? meta['parent'] ?? '').trim();
    const status = String(meta['status'] ?? 'observed');
    const output = String(meta['output_summary'] ?? meta['summary'] ?? '').trim();
    const summary = hp.text ?? '';
    return (
      <div class="trx-routing">
        <span class="trx-routing__icon" aria-hidden>
          <Icon name="bot" size={11} />
        </span>
        <span class="trx-routing__body">
          <span class="trx-routing__head">
            <Show when={parent} fallback={<>handoff to <strong>{agent}</strong></>}>
              handoff <strong>{parent}</strong> → <strong>{agent}</strong>
            </Show>
            <span class="trx-routing__src"> · {status}</span>
          </span>
          <Show when={output || summary}>
            <span class="trx-routing__why">{output || summary}</span>
          </Show>
        </span>
      </div>
    );
  }
  // Inline image parts (1.0 item 2). base64/url sources render directly;
  // backend file references show an honest placeholder until fetched.
  if (p.type === 'image') {
    const src =
      p.source.kind === 'base64' && p.source.data
        ? `data:${p.source.media_type ?? 'image/png'};base64,${p.source.data}`
        : p.source.kind === 'url'
          ? p.source.url
          : undefined;
    if (!src) {
      return (
        <div class="trx-image-unavailable" data-testid="trx-image-unavailable">
          <Icon name="attach" size={12} />
          <span>image attachment (backend file reference — open the Inspector Context tab to preview)</span>
        </div>
      );
    }
    return (
      <img
        class="trx-image"
        src={src}
        alt={p.source.media_type ?? 'image attachment'}
        loading="lazy"
        data-testid="trx-image"
      />
    );
  }
  return null;
}

/** Regenerate variant menu (1.0 item 4). Plain regenerate, regenerate with
 * notes (inline textarea), and regenerate with a different model — all ride
 * clio's retry route which accepts `notes` + `provider_id`/`model_id`. */
function RegenMenu(props: {
  msg: Message;
  models?: ModelOption[];
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<'menu' | 'notes' | 'models'>('menu');
  const [notes, setNotes] = createSignal('');
  let rootEl: HTMLSpanElement | undefined;

  const hasVariants = () =>
    Boolean(props.onRegenerateWithNotes || props.onRegenerateWithModel);

  function close() {
    setOpen(false);
    setMode('menu');
    setNotes('');
  }

  // Close on outside click / Escape while open.
  createEffect(() => {
    if (!open()) return;
    const onDoc = (e: MouseEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    });
  });

  return (
    <span class="trx-regen" ref={rootEl}>
      <button
        type="button"
        class="trx-msg__action"
        title="Regenerate response"
        data-testid={`msg-regen-${props.msg.id}`}
        onClick={() => {
          // Without variant callbacks (fixtures / older call sites) keep the
          // original immediate-regenerate behaviour.
          if (!hasVariants()) {
            props.onRegenerate?.(props.msg);
            return;
          }
          if (open()) close();
          else setOpen(true);
        }}
      >
        <Icon name="regenerate" size={12} />
      </button>
      <Show when={open()}>
        <div
          class="trx-regen__menu"
          role="menu"
          data-testid={`regen-menu-${props.msg.id}`}
        >
          <Show when={mode() === 'menu'}>
            <button
              type="button"
              class="trx-regen__item"
              role="menuitem"
              data-testid={`regen-plain-${props.msg.id}`}
              onClick={() => {
                close();
                props.onRegenerate?.(props.msg);
              }}
            >
              <Icon name="regenerate" size={12} />
              <span>Regenerate</span>
            </button>
            <Show when={props.onRegenerateWithNotes}>
              <button
                type="button"
                class="trx-regen__item"
                role="menuitem"
                data-testid={`regen-notes-${props.msg.id}`}
                onClick={() => setMode('notes')}
              >
                <Icon name="edit" size={12} />
                <span>Regenerate with notes…</span>
              </button>
            </Show>
            <Show
              when={props.onRegenerateWithModel && (props.models?.length ?? 0) > 0}
            >
              <button
                type="button"
                class="trx-regen__item"
                role="menuitem"
                data-testid={`regen-model-${props.msg.id}`}
                onClick={() => setMode('models')}
              >
                <Icon name="bot" size={12} />
                <span>Regenerate with model</span>
                <Icon name="chevron-right" size={10} />
              </button>
            </Show>
          </Show>
          <Show when={mode() === 'notes'}>
            <div class="trx-regen__notes">
              <textarea
                class="trx-regen__textarea"
                rows={3}
                placeholder="Guidance for the retry — e.g. “shorter”, “use Python”, “cite sources”"
                value={notes()}
                data-testid={`regen-notes-input-${props.msg.id}`}
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
              <div class="trx-regen__row">
                <button
                  type="button"
                  class="trx-regen__btn"
                  onClick={() => setMode('menu')}
                >
                  Back
                </button>
                <button
                  type="button"
                  class="trx-regen__btn trx-regen__btn--primary"
                  data-testid={`regen-notes-submit-${props.msg.id}`}
                  disabled={!notes().trim()}
                  onClick={() => {
                    const n = notes().trim();
                    if (!n) return;
                    close();
                    props.onRegenerateWithNotes?.(props.msg, n);
                  }}
                >
                  Regenerate
                </button>
              </div>
            </div>
          </Show>
          <Show when={mode() === 'models'}>
            <div class="trx-regen__models">
              <button
                type="button"
                class="trx-regen__item trx-regen__item--back"
                onClick={() => setMode('menu')}
              >
                ← Back
              </button>
              <For each={props.models ?? []}>
                {(m) => (
                  <button
                    type="button"
                    class="trx-regen__item"
                    role="menuitem"
                    data-testid={`regen-pick-${m.id}-${props.msg.id}`}
                    onClick={() => {
                      close();
                      props.onRegenerateWithModel?.(props.msg, m);
                    }}
                  >
                    <span class="trx-regen__model-id">{m.modelId}</span>
                    <span class="trx-regen__model-provider">{m.providerLabel}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </span>
  );
}

function MessageView(props: {
  msg: Message;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  onSpeak?: (msg: Message) => void | Promise<void>;
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  selected?: boolean;
  onSelect?: (msg: Message) => void;
  searchQuery?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  /** Index of the part that should show the streaming cursor (or -1). */
  streamingPartIdx?: number;
}) {
  const role = () => props.msg.role;
  const isAssistant = () => role() === 'assistant';

  return (
    <article
      class={
        // anim-rise: subtle entrance motion as messages mount (W3 Tier-1);
        // collapses to instant under prefers-reduced-motion.
        'trx-msg anim-rise trx-msg--' + role() + (props.selected ? ' is-selected' : '')
      }
      id={`msg-${props.msg.id}`}
      data-testid={`msg-${props.msg.id}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Don't intercept button clicks (copy/regen/edit/diff chips).
        if (target.closest('button')) return;
        props.onSelect?.(props.msg);
      }}
    >
      <header class="trx-msg__head">
        <span class="trx-msg__avatar">
          <Icon name={ROLE_ICON[role()] ?? 'circle'} size={14} />
        </span>
        <span class="trx-msg__role">{ROLE_LABEL[role()] ?? role()}</span>
        <Show when={isAssistant() && props.msg.model?.model_id}>
          <span class="trx-msg__model">{props.msg.model?.model_id}</span>
        </Show>
        <Show when={props.msg.metadata?.['retry_attempt_id']}>
          {/* Retry lineage chip (1.0 item 3) — this message was created by
              clio's retry route; the full attempt history (notes, status,
              model override) lives in the Inspector's Attempts tab. All
              server-side state: survives reload. */}
          <span
            class="trx-msg__retry-chip"
            title="Created by a retry — see the Inspector's Attempts tab for the lineage"
            data-testid={`msg-retry-chip-${props.msg.id}`}
          >
            ↻ retry
          </span>
        </Show>
        <Show when={props.msg.created_at}>
          <span
            class="trx-msg__when"
            title={absoluteTime(props.msg.created_at!)}
          >
            {humanTime(props.msg.created_at!)}
          </span>
        </Show>
        <span class="trx-msg__actions">
          <Show when={props.onCopy}>
            <button
              type="button"
              class="trx-msg__action"
              title="Copy message"
              data-testid={`msg-copy-${props.msg.id}`}
              onClick={() => props.onCopy?.(props.msg)}
            >
              <Icon name="copy" size={12} />
            </button>
          </Show>
          <Show when={isAssistant() && props.onRegenerate}>
            <RegenMenu
              msg={props.msg}
              models={props.models}
              onRegenerate={props.onRegenerate}
              onRegenerateWithNotes={props.onRegenerateWithNotes}
              onRegenerateWithModel={props.onRegenerateWithModel}
            />
          </Show>
          <Show when={isAssistant() && props.onSpeak}>
            <button
              type="button"
              class="trx-msg__action"
              title="Speak this message"
              data-testid={`msg-speak-${props.msg.id}`}
              onClick={() => void props.onSpeak?.(props.msg)}
            >
              <Icon name="bell" size={12} />
            </button>
          </Show>
          <Show when={props.onCopyPermalink}>
            <button
              type="button"
              class="trx-msg__action"
              title="Copy link to this message"
              data-testid={`msg-link-${props.msg.id}`}
              onClick={() => void props.onCopyPermalink?.(props.msg)}
            >
              <Icon name="arrow-up-right" size={12} />
            </button>
          </Show>
          <Show when={role() === 'user' && props.onEdit}>
            <button
              type="button"
              class="trx-msg__action"
              title="Edit message"
              data-testid={`msg-edit-${props.msg.id}`}
              onClick={() => props.onEdit?.(props.msg)}
            >
              <Icon name="edit" size={12} />
            </button>
          </Show>
          <Show when={props.onQuote}>
            <button
              type="button"
              class="trx-msg__action"
              title="Quote in composer"
              data-testid={`msg-quote-${props.msg.id}`}
              onClick={() => props.onQuote?.(props.msg)}
            >
              <Icon name="branch" size={12} />
            </button>
          </Show>
          <Show when={props.onDelete}>
            <button
              type="button"
              class="trx-msg__action trx-msg__action--danger"
              title="Delete message"
              data-testid={`msg-delete-${props.msg.id}`}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this message? The rest of the conversation will be re-numbered around it.',
                  )
                ) {
                  props.onDelete?.(props.msg);
                }
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </Show>
        </span>
      </header>
      <div class="trx-msg__body">
        <For each={props.msg.parts.filter((p) => shouldRenderPart(p, props.density))}>
          {(part, i) => (
            <PartView
              part={part}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              searchQuery={props.searchQuery}
              messageId={props.msg.id}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={props.matchBaseIndex}
              showCursor={i() === props.streamingPartIdx}
            />
          )}
        </For>
        <Show when={isErrored(props.msg)}>
          <div
            class="trx-msg__error"
            data-testid={`msg-error-${props.msg.id}`}
            role="alert"
          >
            <span class="trx-msg__error-icon">
              <Icon name="alert" size={14} />
            </span>
            <div class="trx-msg__error-body">
              <div class="trx-msg__error-title">
                {props.msg.error_info?.error ?? 'Turn failed'}
              </div>
              <Show when={props.msg.error_info?.message}>
                <div class="trx-msg__error-detail">
                  {props.msg.error_info!.message}
                </div>
              </Show>
              <Show when={props.msg.error_info?.recoverable && isAssistant() && props.onRegenerate}>
                <button
                  type="button"
                  class="trx-msg__error-retry"
                  onClick={() => props.onRegenerate?.(props.msg)}
                  data-testid={`msg-error-retry-${props.msg.id}`}
                >
                  <Icon name="regenerate" size={12} /> Retry
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </article>
  );
}

function isErrored(msg: Message): boolean {
  return msg.stop_reason === 'error' || !!msg.error_info;
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function humanTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = Date.now() - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function Transcript(props: TranscriptProps) {
  // ---- Virtual windowing state (1.0 item 6) ----
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewH, setViewH] = createSignal(900);
  const [measureTick, setMeasureTick] = createSignal(0);
  /** Measured per-message heights (px, incl. flex gap). Estimates until
   * a message has actually rendered once. */
  const measured = new Map<string, number>();

  const virtual = () =>
    props.messages.length > VIRTUAL_THRESHOLD && !!props.scrollEl;

  // Track the scroll container's position + viewport size.
  createEffect(() => {
    const el = props.scrollEl;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    onScroll();
    setViewH(el.clientHeight || 900);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setViewH(el.clientHeight || 900));
      ro.observe(el);
    }
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    });
  });

  const heightOf = (id: string) => measured.get(id) ?? EST_HEIGHT;

  /** Visible [start, end) index range + spacer heights. */
  const vwindow = createMemo(() => {
    if (!virtual()) {
      return { start: 0, end: props.messages.length, padTop: 0, padBottom: 0 };
    }
    void measureTick();
    const msgs = props.messages;
    const top = scrollTop();
    const vh = viewH();
    // First message whose bottom edge crosses the viewport top.
    let acc = 0;
    let start = 0;
    while (start < msgs.length && acc + heightOf(msgs[start]!.id) < top) {
      acc += heightOf(msgs[start]!.id);
      start++;
    }
    // Fill the viewport (+ overscan) going forward.
    let end = start;
    let fill = 0;
    while (end < msgs.length && fill < vh + 400) {
      fill += heightOf(msgs[end]!.id);
      end++;
    }
    // Symmetric buffer rows so fast scrolling has content ready.
    const bStart = Math.max(0, start - VIRTUAL_BUFFER);
    const bEnd = Math.min(msgs.length, end + VIRTUAL_BUFFER);
    let padTop = 0;
    for (let i = 0; i < bStart; i++) padTop += heightOf(msgs[i]!.id);
    let padBottom = 0;
    for (let i = bEnd; i < msgs.length; i++) padBottom += heightOf(msgs[i]!.id);
    return { start: bStart, end: bEnd, padTop, padBottom };
  });

  const visible = createMemo(() => {
    const w = vwindow();
    return virtual() ? props.messages.slice(w.start, w.end) : props.messages;
  });

  // After every windowed render, measure real heights so the spacer
  // estimates converge on reality (messages have variable heights).
  createEffect(() => {
    if (!virtual()) return;
    const slice = visible();
    requestAnimationFrame(() => {
      let changed = false;
      for (const m of slice) {
        const el = document.getElementById(`msg-${m.id}`);
        if (!el) continue;
        const h = el.offsetHeight + TRX_GAP;
        if (h > TRX_GAP && Math.abs((measured.get(m.id) ?? 0) - h) > 1) {
          measured.set(m.id, h);
          changed = true;
        }
      }
      if (changed) setMeasureTick((n) => n + 1);
    });
  });

  /** Estimated pixel offset of message #idx (for off-window jumps). */
  function offsetOfIndex(idx: number): number {
    let sum = 0;
    for (let i = 0; i < idx && i < props.messages.length; i++) {
      sum += heightOf(props.messages[i]!.id);
    }
    return sum;
  }

  // Cmd+F navigation across a virtualized transcript: when the focused
  // match's message is outside the rendered window, scroll the container
  // to its estimated offset so it mounts — ChatScreen's own effect then
  // fine-scrolls to the exact <mark> element.
  createEffect(() => {
    const key = props.currentMatchKey;
    if (!key || !virtual()) return;
    const msgId = key.slice(0, key.lastIndexOf(':'));
    const idx = props.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const w = vwindow();
    if (idx >= w.start && idx < w.end) return;
    props.scrollEl?.scrollTo({ top: offsetOfIndex(idx), behavior: 'auto' });
  });

  // Permalink navigation. When the URL hash matches a message id
  // (e.g. user pasted a clio://session/<sid>#<mid> URL into the
  // address bar), scroll the matching article into view and flash a
  // brief highlight. Re-runs after the messages list grows so a
  // late-loading transcript still picks up the hash target.
  function jumpToHash() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const target =
      hash.startsWith('#msg-') ? hash.slice(1) : `msg-${hash.slice(1)}`;
    const el = document.getElementById(target);
    if (!el) {
      // Virtual mode: the message may exist but sit outside the rendered
      // window — scroll to its estimated offset so it mounts, then retry.
      if (virtual()) {
        const id = target.replace(/^msg-/, '');
        const idx = props.messages.findIndex((m) => m.id === id);
        if (idx !== -1) {
          props.scrollEl?.scrollTo({ top: offsetOfIndex(idx) });
          setTimeout(jumpToHash, 150);
        }
      }
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('trx-msg--flash');
    setTimeout(() => el.classList.remove('trx-msg--flash'), 1800);
  }
  onMount(() => {
    queueMicrotask(jumpToHash);
  });
  createEffect(() => {
    void props.messages.length;
    queueMicrotask(jumpToHash);
  });

  // Pre-compute the per-message base-index for the global match
  // numbering so PartView can label each match with a stable key.
  const baseIndexFor = (msgId: string): number => {
    if (!props.searchQuery) return 0;
    const q = props.searchQuery.trim().toLowerCase();
    if (!q) return 0;
    let total = 0;
    for (const m of props.messages) {
      if (m.id === msgId) return total;
      for (const p of m.parts) {
        if (p.type === 'text' && p.text) {
          total += countOccurrences(p.text.toLowerCase(), q);
        }
      }
    }
    return total;
  };

  // Find the latest in-progress assistant turn (no stop_reason) and
  // its last text part — that's where the streaming cursor goes.
  const streamingTarget = (): { msgId: string; partIdx: number } | null => {
    if (!props.streaming) return null;
    for (let i = props.messages.length - 1; i >= 0; i--) {
      const m = props.messages[i];
      if (!m || m.role !== 'assistant') continue;
      if (m.stop_reason) return null; // already completed
      const visible = m.parts.filter((p) => shouldRenderPart(p, props.density));
      let lastTextIdx = -1;
      for (let j = visible.length - 1; j >= 0; j--) {
        if (visible[j]?.type === 'text') {
          lastTextIdx = j;
          break;
        }
      }
      return lastTextIdx === -1 ? null : { msgId: m.id, partIdx: lastTextIdx };
    }
    return null;
  };

  return (
    // aria-live: screen readers announce streamed content as it lands
    // (polite — queued behind the user's current reading position).
    // aria-busy flags the in-flight turn so AT can defer announcement.
    <div
      class={'trx' + (virtual() ? ' trx--virtual' : '')}
      data-density={props.density}
      data-testid="transcript"
      aria-live="polite"
      aria-busy={props.streaming ? 'true' : 'false'}
    >
      <Show when={props.loading && props.messages.length === 0}>
        {/* Skeleton conversation while messages load on session switch
            (W3 Tier-1) — alternating user/assistant shaped bubbles. */}
        <div class="trx__skeleton" data-testid="transcript-skeleton" aria-hidden="true">
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant trx__skeleton-bubble--short" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user trx__skeleton-bubble--short" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
        </div>
      </Show>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padTop}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-top"
        />
      </Show>
      <For each={visible()}>
        {(m) => {
          const target = streamingTarget();
          const partIdx = target?.msgId === m.id ? target.partIdx : -1;
          return (
            <MessageView
              msg={m}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              onCopy={props.onCopy}
              onRegenerate={props.onRegenerate}
              onRegenerateWithNotes={props.onRegenerateWithNotes}
              onRegenerateWithModel={props.onRegenerateWithModel}
              models={props.models}
              onEdit={props.onEdit}
              onQuote={props.onQuote}
              onSpeak={props.onSpeak}
              onCopyPermalink={props.onCopyPermalink}
              onDelete={props.onDelete}
              selected={m.id === props.selectedId}
              onSelect={props.onSelect}
              searchQuery={props.searchQuery}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={baseIndexFor(m.id)}
              streamingPartIdx={partIdx}
            />
          );
        }}
      </For>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padBottom}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-bottom"
        />
      </Show>
    </div>
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

/**
 * Pure-text renderer that wraps every case-insensitive match of `query`
 * in a <mark class="tx-match">, marking the currently-focused match
 * (per global index, identified by `currentMatchKey`) with an extra
 * `tx-match--current` class so the Cmd+F bar can scroll-into-view.
 */
function HighlightedText(props: {
  text: string;
  query: string;
  messageId: string;
  baseIndex: number;
  currentMatchKey: string;
}) {
  const parts = () => {
    const out: Array<{ kind: 'plain' | 'match'; text: string; idx?: number }> = [];
    const q = props.query;
    if (!q) {
      out.push({ kind: 'plain', text: props.text });
      return out;
    }
    const lower = props.text.toLowerCase();
    const needle = q.toLowerCase();
    let cursor = 0;
    let matchN = 0;
    let i = lower.indexOf(needle, cursor);
    while (i !== -1) {
      if (i > cursor) {
        out.push({ kind: 'plain', text: props.text.slice(cursor, i) });
      }
      out.push({
        kind: 'match',
        text: props.text.slice(i, i + needle.length),
        idx: props.baseIndex + matchN,
      });
      matchN += 1;
      cursor = i + needle.length;
      i = lower.indexOf(needle, cursor);
    }
    if (cursor < props.text.length) {
      out.push({ kind: 'plain', text: props.text.slice(cursor) });
    }
    return out;
  };

  return (
    <>
      <For each={parts()}>
        {(seg) =>
          seg.kind === 'plain' ? (
            <span>{seg.text}</span>
          ) : (
            <mark
              class={
                'tx-match ' +
                (`${props.messageId}:${seg.idx}` === props.currentMatchKey
                  ? 'tx-match--current'
                  : '')
              }
              data-match-key={`${props.messageId}:${seg.idx}`}
            >
              {seg.text}
            </mark>
          )
        }
      </For>
    </>
  );
}
