/**
 * Small shared transcript part views (e.g. the thinking part). Exports
 * {@link ThinkingPartView}.
 */
import type { Part } from '@clio/core';
import { Icon } from './Icon.js';

export function ThinkingPartView(props: { part: Part }) {
  const p = props.part as Part & { thinking?: string; text?: string };
  const body = p.thinking ?? p.text ?? '';
  const charCount = body.length;
  return (
    <details class="trx-thinking">
      <summary>
        <Icon
          name="chevron-right"
          size={12}
          class="trx-provider-thinking__chevron"
          label="Toggle thinking"
        />
        <span class="trx-thinking__label">thinking</span>
        <span class="trx-thinking__count">({charCount} chars)</span>
      </summary>
      <pre>{body}</pre>
    </details>
  );
}
