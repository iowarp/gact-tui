/**
 * UI component: Diff Pane Line. Exports `DiffPaneLine`.
 */
import { Show } from 'solid-js';
import { hljsSync } from '../hljs-lazy.js';
import type { DiffLineInfo } from './DiffPaneModel.js';

export function DiffPaneLine(props: {
  line: DiffLineInfo;
  lang: string | null;
  ready: boolean;
}) {
  const content = () => props.line.text.slice(1);
  const highlighted = () => {
    if (!props.ready || !props.lang || !content()) return null;
    const hljs = hljsSync();
    if (!hljs) return null;
    try {
      return hljs.highlight(content(), { language: props.lang }).value;
    } catch {
      return null;
    }
  };
  return (
    <div class={'diffpane__line diffpane__line--' + props.line.sign}>
      <span class="diffpane__lineno" aria-hidden="true">
        {props.line.oldNo ?? ''}
      </span>
      <span class="diffpane__lineno" aria-hidden="true">
        {props.line.newNo ?? ''}
      </span>
      <span class="diffpane__line-sign" aria-hidden="true">
        {props.line.sign === 'add' ? '+' : props.line.sign === 'del' ? '−' : ' '}
      </span>
      <Show
        when={highlighted() !== null}
        fallback={<code class="diffpane__line-code">{content() || ' '}</code>}
      >
        <code class="diffpane__line-code hljs" innerHTML={highlighted()!} />
      </Show>
    </div>
  );
}
