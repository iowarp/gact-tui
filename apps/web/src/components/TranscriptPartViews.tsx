/**
 * Small shared transcript part views (e.g. the thinking part). Exports
 * {@link ThinkingPartView}.
 */
import type { Part } from '@clio/core';
import { Icon } from './Icon.js';

export function ThinkingPartView(props: { part: Part }) {
  const p = props.part as Part & { thinking?: string; text?: string };
  const body = p.thinking ?? p.text ?? '';
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const label =
    wordCount > 0 ? `Thought for ~${wordCount} word${wordCount === 1 ? '' : 's'}` : 'Thinking';
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
