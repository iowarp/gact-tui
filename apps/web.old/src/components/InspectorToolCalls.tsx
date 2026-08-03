/**
 * Inspector "Tool calls" tab: lists the turn's tool invocations with their
 * status, duration, and expandable input/output payloads.
 */
import { createSignal, For, Show } from 'solid-js';
import type { Message, Part } from '@clio/core';
import { Icon } from './Icon.js';
import {
  toolCallInput,
  toolCallOutput,
  toolDisplayName,
  type ToolCallSummary,
} from './InspectorToolCallsModel.js';

export { summarizeToolCalls, type ToolCallSummary } from './InspectorToolCallsModel.js';

export function ToolCallsTab(props: { summaries: ToolCallSummary[]; message: Message | null }) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Tool calls</div>
      <ul class="inspector__calls">
        <For each={props.summaries}>
          {(summary) => <ToolCallRow summary={summary} parts={props.message?.parts ?? []} />}
        </For>
      </ul>
    </section>
  );
}

export function ToolCallRow(props: { summary: ToolCallSummary; parts: Part[] }) {
  const [open, setOpen] = createSignal(false);
  const callInput = () => toolCallInput(props.summary, props.parts);
  const callOutput = () => toolCallOutput(props.summary, props.parts);

  const hasDetail = () => callInput() != null || callOutput() != null;
  const displayName = () => toolDisplayName(props.summary.toolName);
  const rawName = () => props.summary.toolName;

  return (
    <li
      class={'inspector__call inspector__call--' + props.summary.status}
      data-testid={`inspector-call-${props.summary.callId}`}
    >
      <button
        type="button"
        class="inspector__call-row"
        onClick={() => hasDetail() && setOpen((v) => !v)}
        aria-disabled={!hasDetail()}
      >
        <Icon name="tool" size={14} class="inspector__call-icon" />
        <span class="inspector__call-labels">
          <span class="inspector__call-name">{displayName()}</span>
          <Show when={displayName() !== rawName()}>
            <span class="inspector__call-raw">{rawName()}</span>
          </Show>
        </span>
        <Show when={props.summary.durationMs != null}>
          <span class="inspector__call-dur">{props.summary.durationMs}ms</span>
        </Show>
        <Show when={hasDetail()}>
          <Icon
            name="chevron-right"
            size={12}
            class={'inspector__call-chev ' + (open() ? 'is-open' : '')}
          />
        </Show>
      </button>
      <Show when={open() && callInput()}>
        <div class="inspector__call-detail">
          <div class="inspector__call-detail-label">
            input
            <button
              type="button"
              class="inspector__call-copy"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(callInput()!);
                }
              }}
              title="Copy input JSON"
            >
              copy
            </button>
          </div>
          <pre class="inspector__call-detail-body">{callInput()}</pre>
        </div>
      </Show>
      <Show when={open() && callOutput()}>
        <div class="inspector__call-detail">
          <div class="inspector__call-detail-label">
            output
            <button
              type="button"
              class="inspector__call-copy"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(callOutput()!);
                }
              }}
              title="Copy output"
            >
              copy
            </button>
          </div>
          <pre class="inspector__call-detail-body">{callOutput()}</pre>
        </div>
      </Show>
    </li>
  );
}
