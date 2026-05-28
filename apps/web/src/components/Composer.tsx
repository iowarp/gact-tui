import { createMemo, createSignal, Show, type JSX } from 'solid-js';
import { AtMentionPicker, DEFAULT_ITEMS, type MentionItem } from './AtMentionPicker.js';
import './composer.css';

export interface ComposerProps {
  /** Hint shown in the backend picker chip when no slot is provided. */
  backendLabel?: string;
  /** Disable Send (e.g. while streaming, or while a session isn't selected). */
  disabled?: boolean;
  /**
   * Optional slot for the backend chip — when provided, replaces the
   * static `⬤ host` chip with a live picker. ChatScreen passes
   * `<BackendPicker />` here.
   */
  backendSlot?: JSX.Element;
  /**
   * When true, the Send button switches to a Stop affordance and calls
   * `onStop` instead of submitting. Drives the visual `stop-mid-stream`
   * proof.
   */
  streaming?: boolean;
  /** Called when the user clicks the Stop button while streaming. */
  onStop?: () => void | Promise<void>;
  /** Optional file/agent/tool index for the @-mention picker. */
  mentionItems?: MentionItem[];
  /**
   * Called when the user submits a message. The promise resolves when the
   * POST completes; while it's pending the composer clears its draft and
   * shows the send button as busy.
   */
  onSubmit?: (text: string) => Promise<void> | void;
}

export function Composer(props: ComposerProps = {}) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [permMode, setPermMode] = createSignal<'ask' | 'auto-edits' | 'plan' | 'auto' | 'bypass'>('ask');
  const [model, setModel] = createSignal('opus-4.7');
  const [error, setError] = createSignal<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = createSignal(0);

  // The @-mention picker opens when the user is mid-token after an `@`.
  // `mentionQuery` is the substring after the most-recent `@` up to the
  // caret; `mentionOpen` derives from that.
  const mentionQuery = createMemo(() => {
    const t = text();
    const at = t.lastIndexOf('@');
    if (at === -1) return null;
    const tail = t.slice(at + 1);
    if (/\s/.test(tail)) return null;
    return tail;
  });
  const mentionOpen = () => mentionQuery() !== null;

  function pickMention(item: MentionItem) {
    const t = text();
    const at = t.lastIndexOf('@');
    const next = (at === -1 ? t : t.slice(0, at)) + '@' + item.label + ' ';
    setText(next);
    setMentionHighlight(0);
  }

  async function submit() {
    const t = text().trim();
    if (!t || busy() || props.disabled) return;
    setError(null);
    if (!props.onSubmit) {
      // Fixture-driven mode: nothing to POST. The textarea clears so the
      // visual proofs always show the empty composer state after send.
      setText('');
      return;
    }
    setBusy(true);
    setText('');
    try {
      await props.onSubmit(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Restore the draft on failure so the user doesn't lose typing.
      setText(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="composer" data-testid="composer">
      <div class="composer__pickers">
        <Show
          when={props.backendSlot}
          fallback={
            <button type="button" class="composer__picker" data-testid="composer-backend">
              ⬤ {props.backendLabel ?? 'localhost'} ▼
            </button>
          }
        >
          {props.backendSlot}
        </Show>
        <button type="button" class="composer__picker" data-testid="composer-project">
          📁 gact-tui ▼
        </button>
        <button
          type="button"
          class="composer__picker composer__picker--perm"
          data-testid="composer-perm"
          onClick={() =>
            setPermMode((m) =>
              m === 'ask' ? 'auto-edits' : m === 'auto-edits' ? 'plan' : m === 'plan' ? 'auto' : m === 'auto' ? 'bypass' : 'ask',
            )
          }
        >
          🛡 {permMode()} ▼
        </button>
        <button
          type="button"
          class="composer__picker"
          data-testid="composer-model"
          onClick={() => setModel((m) => (m === 'opus-4.7' ? 'sonnet-4.6' : 'opus-4.7'))}
        >
          {model()} ▼
        </button>
      </div>
      {error() && (
        <div class="composer__error" data-testid="composer-error">
          {error()}
        </div>
      )}
      <div class="composer__row">
        <button type="button" class="composer__attach" title="attach context">＋</button>
        <div class="composer__input-wrap">
          <textarea
            class="composer__input"
            placeholder="Ask CLIO about your data…  type @ for files, agents, tools"
            rows={1}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (mentionOpen()) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionHighlight((h) => h + 1);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionHighlight((h) => Math.max(0, h - 1));
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            data-testid="composer-input"
          />
          <AtMentionPicker
            open={mentionOpen()}
            query={mentionQuery() ?? ''}
            items={props.mentionItems ?? DEFAULT_ITEMS}
            highlight={mentionHighlight()}
            onPick={pickMention}
            onClose={() => setMentionHighlight(0)}
          />
        </div>
        <Show
          when={props.streaming}
          fallback={
            <button
              type="button"
              class="btn btn--primary composer__send"
              disabled={!text().trim() || busy() || props.disabled}
              data-testid="composer-send"
              onClick={() => void submit()}
            >
              {busy() ? '…' : '▶'}
            </button>
          }
        >
          <button
            type="button"
            class="btn btn--danger composer__send"
            data-testid="composer-stop"
            onClick={() => void props.onStop?.()}
            title="Cancel the current run (Esc)"
          >
            ■
          </button>
        </Show>
      </div>
    </div>
  );
}
