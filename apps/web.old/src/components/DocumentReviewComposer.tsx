import { createSignal, onMount } from 'solid-js';
import type { DocumentAnchor } from '@clio/core';

interface DocumentReviewComposerProps {
  anchor: DocumentAnchor;
  rect: DOMRect;
  submitting: boolean;
  error?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function DocumentReviewComposer(props: DocumentReviewComposerProps) {
  const [text, setText] = createSignal('');
  let textarea: HTMLTextAreaElement | undefined;
  onMount(() => textarea?.focus());

  const left = () => Math.max(16, Math.min(window.innerWidth - 376, props.rect.left));
  const top = () => Math.max(16, Math.min(window.innerHeight - 210, props.rect.bottom + 10));

  return (
    <section
      class="document-review-composer"
      style={{ left: `${left()}px`, top: `${top()}px` }}
      data-testid="document-review-composer"
      aria-label="Comment on selection"
    >
      <div class="document-review-composer__selection">
        <span>Selected</span>
        <q>{props.anchor.exact}</q>
      </div>
      <textarea
        ref={textarea}
        value={text()}
        placeholder="Tell the agent what to change…"
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && text().trim()) {
            props.onSubmit(text().trim());
          }
          if (event.key === 'Escape') props.onCancel();
        }}
      />
      {props.error ? <p class="document-review-composer__error">{props.error}</p> : null}
      <footer>
        <span>Ctrl/⌘ Enter to send</span>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class="document-review-composer__send"
          disabled={!text().trim() || props.submitting}
          onClick={() => props.onSubmit(text().trim())}
        >
          {props.submitting ? 'Sending…' : 'Send to agent'}
        </button>
      </footer>
    </section>
  );
}
