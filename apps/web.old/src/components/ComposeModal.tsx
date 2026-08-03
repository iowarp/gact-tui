/**
 * UI component: Compose Modal. Renders `ComposeModal` from `ComposeModalProps`.
 */
import { Show, createEffect, createSignal, onMount } from 'solid-js';
import { Icon } from './Icon.js';
import { registerWindowKeydown } from '../domListeners.js';
import { trapFocusRef } from '../focus-trap.js';
import './compose-modal.css';

export interface ComposeModalProps {
  open: boolean;
  /** Same shape as Composer's draftKey — scopes the localStorage slot. */
  draftKey: string;
  /** Called when the user hits Cmd/Ctrl+Enter. */
  onSubmit: (text: string) => Promise<void> | void;
  /** Called when the user closes without sending. The current text has
   * already been written back to localStorage by the time this fires. */
  onClose: () => void;
}

/**
 * Ctrl+G fullscreen prompt authoring. Shares per-session draft storage
 * with the inline Composer (`clio.draft.{sessionId}`), so what you type
 * here flows back into the composer on close.
 *
 * Mirrors the TUI's compose modal (which TUI binds to Ctrl+G as well).
 * UI strings stay English; the modal is intentionally chrome-free so
 * very long prompts can be edited without the rail or transcript.
 */
export function ComposeModal(props: ComposeModalProps) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;

  const storageKey = () => `clio.draft.${props.draftKey}`;

  // On open, hydrate from localStorage and focus.
  createEffect(() => {
    if (!props.open) return;
    try {
      const restored = localStorage.getItem(storageKey()) ?? '';
      setText(restored);
    } catch {
      setText('');
    }
    queueMicrotask(() => {
      const ta = textareaRef;
      if (!ta) return;
      ta.focus();
      // Park caret at end so users can keep typing where they left off.
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  });

  // Persist every keystroke. Same fast-write contract as Composer.
  createEffect(() => {
    if (!props.open) return;
    const cur = text();
    try {
      if (cur) localStorage.setItem(storageKey(), cur);
      else localStorage.removeItem(storageKey());
    } catch {
      /* ignore — quota / private mode */
    }
  });

  async function submit() {
    const value = text().trim();
    if (!value || busy()) return;
    setBusy(true);
    try {
      await props.onSubmit(text());
      try {
        localStorage.removeItem(storageKey());
      } catch {
        /* ignore */
      }
      setText('');
      props.onClose();
    } finally {
      setBusy(false);
    }
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void submit();
      }
    };
    registerWindowKeydown(onKey, true);
  });

  const lineCount = () => text().split('\n').length;
  const charCount = () => text().length;

  return (
    <Show when={props.open}>
      <div class="cmp__backdrop" onClick={props.onClose} />
      <div
        class="cmp"
        role="dialog"
        aria-modal="true"
        aria-label="Compose prompt"
        ref={trapFocusRef}
        data-testid="compose-modal"
      >
        <header class="cmp__head">
          <span class="eyebrow">Compose · {props.draftKey === '__new' ? 'new session' : 'draft'}</span>
          <button
            type="button"
            class="cmp__close"
            onClick={props.onClose}
            aria-label="Close compose modal"
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <textarea
          ref={textareaRef}
          class="cmp__textarea"
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder="Write the prompt. Cmd/Ctrl+Enter to send · Esc to keep the draft and close."
          spellcheck={true}
          data-testid="compose-modal-textarea"
        />
        <footer class="cmp__foot">
          <span class="chip">
            {lineCount()} {lineCount() === 1 ? 'line' : 'lines'}
          </span>
          <span class="chip">
            {charCount()} {charCount() === 1 ? 'char' : 'chars'}
          </span>
          <span class="chip cmp__hint">⌘/Ctrl + ↵ send · Esc close</span>
          <button
            type="button"
            class="cmp__send"
            onClick={() => void submit()}
            disabled={busy() || !text().trim()}
            data-testid="compose-modal-send"
          >
            <Icon name="send" size={13} />
            <span>{busy() ? 'Sending…' : 'Send'}</span>
          </button>
        </footer>
      </div>
    </Show>
  );
}
