/**
 * UI component: Inline Markdown Code Block. Exports `CodeBlock`.
 */
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { getHljs, hljsSync } from '../hljs-lazy.js';

/**
 * Renders a fenced code block with a hover-revealed Copy button, a
 * non-selectable line-number gutter (for multi-line blocks), and
 * syntax highlighting.
 *
 * highlight.js loads on demand (see hljs-lazy): the block first renders
 * HTML-escaped plain source, then re-renders highlighted once hljs
 * resolves. The signal flip drives the re-render. The Copy button always
 * copies the RAW source (props.body) — never the line numbers.
 */
export function CodeBlock(props: { lang: string | null; body: string }) {
  const [copied, setCopied] = createSignal(false);
  const [hljsReady, setHljsReady] = createSignal(hljsSync() !== null);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (hljsSync()) {
      setHljsReady(true);
      return;
    }
    void getHljs().then(() => setHljsReady(true));
  });

  function copy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(props.body).then(() => {
      setCopied(true);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setCopied(false), 1600);
    });
  }

  const highlighted = createMemo(() => {
    const code = props.body;
    const hljs = hljsReady() ? hljsSync() : null;
    if (!hljs) return escapeHtml(code);
    const lang = (props.lang ?? '').toLowerCase();
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  });

  const lines = createMemo(() => highlighted().split('\n'));
  const showGutter = () => lines().length > 1;

  return (
    <pre class={'im__code ' + (props.lang ? `im__code--${props.lang}` : '')}>
      <Show when={props.lang}>
        <span class="im__code-lang">{props.lang}</span>
      </Show>
      <button
        type="button"
        class={'im__code-copy ' + (copied() ? 'is-copied' : '')}
        onClick={copy}
        aria-label="Copy code"
        title="Copy code"
      >
        {copied() ? 'copied' : 'copy'}
      </button>
      {/* hljs HTML-escapes the source, so this markup is injection-safe. */}
      <Show
        when={showGutter()}
        fallback={<code class="hljs" innerHTML={highlighted()} />}
      >
        <code class="hljs im__code--numbered">
          <For each={lines()}>
            {(line, i) => (
              <span class="im__code-row">
                <span class="im__code-lineno" aria-hidden="true">
                  {i() + 1}
                </span>
                {/* Per-line highlighted HTML; escaped by hljs / escapeHtml. */}
                <span class="im__code-linecode" innerHTML={line || ' '} />
              </span>
            )}
          </For>
        </code>
      </Show>
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
