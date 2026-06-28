/**
 * Renders a text part as markdown (with code blocks) inside a transcript
 * message.
 */
import { For, Show, createMemo } from 'solid-js';
import type { Part } from '@clio/core';
import { InlineMarkdown } from './InlineMarkdown.js';
import { CommandResultCard, commandResultInfo } from './TranscriptToolParts.js';
import { WorkflowStateCard, splitWorkflowState } from './WorkflowState.js';

export function TextPartView(props: {
  part: Extract<Part, { type: 'text' }>;
  searchQuery?: string;
  messageId?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  showCursor?: boolean;
}) {
  const text = () => props.part.text ?? '';
  const commandResult = createMemo(() => commandResultInfo(props.part, text()));
  if (commandResult() && !props.searchQuery?.trim()) {
    return (
      <CommandResultCard command={commandResult()!.command} text={commandResult()!.text}>
        <Show when={props.showCursor}>
          <span class="trx-cursor" aria-hidden>
            ▌
          </span>
        </Show>
      </CommandResultCard>
    );
  }
  const workflow = createMemo(() => splitWorkflowState(text()));
  if (workflow() && !props.searchQuery?.trim()) {
    return (
      <div class="trx-text">
        <Show when={workflow()!.before.trim()}>
          <InlineMarkdown text={workflow()!.before.trim()} />
        </Show>
        <WorkflowStateCard state={workflow()!.state} raw={workflow()!.raw} />
        <Show when={workflow()!.after.trim()}>
          <InlineMarkdown text={workflow()!.after.trim()} />
        </Show>
        <Show when={props.showCursor}>
          <span class="trx-cursor" aria-hidden>
            ▌
          </span>
        </Show>
      </div>
    );
  }
  const q = props.searchQuery?.trim() ?? '';
  if (!q) {
    return (
      <div class="trx-text">
        <InlineMarkdown text={text()} />
        <Show when={props.showCursor}>
          <span class="trx-cursor" aria-hidden>
            ▌
          </span>
        </Show>
      </div>
    );
  }
  return (
    <div class="trx-text">
      <HighlightedText
        text={text()}
        query={q}
        messageId={props.messageId ?? ''}
        baseIndex={props.matchBaseIndex ?? 0}
        currentMatchKey={props.currentMatchKey ?? ''}
      />
      <Show when={props.showCursor}>
        <span class="trx-cursor" aria-hidden>
          ▌
        </span>
      </Show>
    </div>
  );
}

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
