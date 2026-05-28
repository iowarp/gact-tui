import { createSignal, Show, type JSX } from 'solid-js';
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
        <textarea
          class="composer__input"
          placeholder="Ask CLIO about your data…"
          rows={1}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          data-testid="composer-input"
        />
        <button
          type="button"
          class="btn btn--primary composer__send"
          disabled={!text().trim() || busy() || props.disabled}
          data-testid="composer-send"
          onClick={() => void submit()}
        >
          {busy() ? '…' : '▶'}
        </button>
      </div>
    </div>
  );
}
