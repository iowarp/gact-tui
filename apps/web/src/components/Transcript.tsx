import { For, Show } from 'solid-js';
import type { FileDiff, Message, Part } from '@clio/core';
import { Icon, type IconName } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import './transcript.css';
import './inline-markdown.css';

export type TranscriptDensity = 'verbose' | 'normal' | 'summary';

export interface TranscriptProps {
  messages: Message[];
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  /** Optional per-message action callbacks. Wired in LiveDriven mode. */
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  /** Currently-focused message id (drives the Inspector). */
  selectedId?: string;
  onSelect?: (msg: Message) => void;
  /** Cmd+F highlight state. */
  searchQuery?: string;
  /** Match identifier "<message_id>:<index>" pointing at the focused hit. */
  currentMatchKey?: string;
}

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
    return part.type === 'text' || part.type === 'file_diff';
  }
  return part.type !== 'thinking';
}

function PartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  searchQuery?: string;
  messageId?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
}) {
  const p = props.part;
  if (p.type === 'text') {
    const text = p.text ?? '';
    const q = props.searchQuery?.trim() ?? '';
    if (!q) {
      return (
        <div class="trx-text">
          <InlineMarkdown text={text} />
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
      <button
        type="button"
        class="trx-filediff"
        data-testid="filediff-chip"
        onClick={() => props.onOpenDiff?.(p)}
      >
        <Icon name="diff" size={14} />
        <div class="trx-filediff__chip">
          <span class="trx-filediff__path">{p.path}</span>
          <span class="trx-filediff__stats">
            <span class="trx-filediff__plus">+{stats.adds}</span>
            <span class="trx-filediff__minus">−{stats.dels}</span>
          </span>
        </div>
      </button>
    );
  }
  return null;
}

function MessageView(props: {
  msg: Message;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  selected?: boolean;
  onSelect?: (msg: Message) => void;
  searchQuery?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
}) {
  const role = () => props.msg.role;
  const isAssistant = () => role() === 'assistant';

  return (
    <article
      class={
        'trx-msg trx-msg--' + role() + (props.selected ? ' is-selected' : '')
      }
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
        <Show when={props.msg.created_at}>
          <span class="trx-msg__when">{humanTime(props.msg.created_at!)}</span>
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
            <button
              type="button"
              class="trx-msg__action"
              title="Regenerate response"
              data-testid={`msg-regen-${props.msg.id}`}
              onClick={() => props.onRegenerate?.(props.msg)}
            >
              <Icon name="regenerate" size={12} />
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
        </span>
      </header>
      <div class="trx-msg__body">
        <For each={props.msg.parts.filter((p) => shouldRenderPart(p, props.density))}>
          {(part) => (
            <PartView
              part={part}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              searchQuery={props.searchQuery}
              messageId={props.msg.id}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={props.matchBaseIndex}
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

  return (
    <div class="trx" data-density={props.density} data-testid="transcript">
      <For each={props.messages}>
        {(m) => (
          <MessageView
            msg={m}
            density={props.density}
            onOpenDiff={props.onOpenDiff}
            onCopy={props.onCopy}
            onRegenerate={props.onRegenerate}
            onEdit={props.onEdit}
            selected={m.id === props.selectedId}
            onSelect={props.onSelect}
            searchQuery={props.searchQuery}
            currentMatchKey={props.currentMatchKey}
            matchBaseIndex={baseIndexFor(m.id)}
          />
        )}
      </For>
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
