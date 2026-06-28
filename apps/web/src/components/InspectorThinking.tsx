/**
 * Inspector 'Thinking' tab: shows the model's reasoning/thinking stream.
 * Exports {@link ThinkingTab}.
 */
import { For } from 'solid-js';
import type { Message } from '@clio/core';

export interface ThinkingTabProps {
  message: Message | null;
}

export function ThinkingTab(props: ThinkingTabProps) {
  const thinkingParts = () =>
    (props.message?.parts ?? []).filter((part) => part.type === 'thinking');

  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Thinking</div>
      <For each={thinkingParts()}>
        {(part) => (
          <pre class="inspector__thinking">
            {(part as { thinking?: string; text?: string }).thinking ??
              (part as { text?: string }).text ??
              ''}
          </pre>
        )}
      </For>
    </section>
  );
}
