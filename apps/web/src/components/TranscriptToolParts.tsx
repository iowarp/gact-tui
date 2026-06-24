/**
 * Inline transcript view for tool-call parts: invocation header, arguments, and
 * result/error disclosure with telemetry.
 */
import { For, Show, type JSX } from 'solid-js';
import type { Part, PartToolCall, PartToolResult } from '@clio/core';
import {
  summarizeToolResultPresentation,
  toolInputRows,
  type StructuredResultPresentation,
} from '../presentation.js';
import { Icon } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import { prettyJson } from './WorkflowState.js';
import { toolResultBody } from './TranscriptToolPartsModel.js';
import { PartCard } from './TranscriptPartCard.js';

export {
  commandResultInfo,
  metadataToolDiffs,
  toolResultBody,
} from './TranscriptToolPartsModel.js';

export function ToolCallPartView(props: {
  part: PartToolCall;
  density: 'verbose' | 'normal' | 'summary';
}) {
  const p = props.part;
  const inputRows = () => toolInputRows(p.input ?? {});
  if (props.density === 'normal') {
    return (
      <div
        class="trx-toolcall trx-toolcall--collapsed"
        data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
      >
        <Icon name="tool" size={14} class="trx-toolcall__icon" />
        <span class="trx-toolcall__name">{p.tool_name}</span>
        <span class="trx-toolcall__args">
          ({inputRows().slice(0, 2).map((row) => row.label).join(', ')})
        </span>
      </div>
    );
  }
  return (
    <div
      class="trx-toolcall"
      data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
    >
      <Icon name="tool" size={14} class="trx-toolcall__icon" />
      <div style="flex:1; min-width:0">
        <div>
          <span class="trx-toolcall__name">{p.tool_name}</span>
        </div>
        <Show when={inputRows().length > 0} fallback={<div class="trx-toolcall__empty">No visible input</div>}>
          <dl class="trx-toolcall__kv">
            <For each={inputRows()}>
              {(row) => (
                <div>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
      </div>
    </div>
  );
}

export function ToolResultPartView(props: {
  part: PartToolResult;
  searchQuery?: string;
}) {
  const p = props.part;
  const body = toolResultBody(p);
  const toolResultName = String(
    (p as Part & { tool_name?: string }).tool_name ??
      p.metadata?.['tool_name'] ??
      p.metadata?.['tool'] ??
      '',
  );
  const structured = summarizeToolResultPresentation(toolResultName, body);
  if (structured && !props.searchQuery?.trim()) {
    return (
      <StructuredToolResultCard
        result={structured}
        error={Boolean(p.is_error)}
        cached={p.cached}
        durationMs={p.duration_ms}
      />
    );
  }
  return (
    <div class={'trx-toolresult ' + (p.is_error ? 'trx-toolresult--err' : '')}>
      <Icon name="check" size={14} class="trx-toolresult__icon" />
      <div class="trx-toolresult__main">
        <pre>{body}</pre>
        <ToolTelemetryFooter cached={p.cached} durationMs={p.duration_ms} />
      </div>
    </div>
  );
}

/**
 * v0.2 tool telemetry (capabilities.tool_telemetry): a memory-cache-hit badge
 * and the wall-clock duration, shown inline under a tool result. The TUI shows
 * the same signals (duration as "{n}ms"); the web dropped them before. Renders
 * nothing when neither signal is present.
 */
function ToolTelemetryFooter(props: { cached?: boolean; durationMs?: number }) {
  const hasDuration = () => (props.durationMs ?? 0) > 0;
  return (
    <Show when={Boolean(props.cached) || hasDuration()}>
      <div class="trx-tool-telemetry" data-testid="tool-telemetry">
        <Show when={props.cached}>
          <span
            class="trx-tool-telemetry__chip trx-tool-telemetry__chip--cached"
            title="Served from the memory cache"
          >
            <Icon name="check" size={11} /> cached
          </span>
        </Show>
        <Show when={hasDuration()}>
          <span class="trx-tool-telemetry__chip" title="Wall-clock duration including cache lookup">
            {Math.round(props.durationMs as number)}ms
          </span>
        </Show>
      </div>
    </Show>
  );
}

function StructuredToolResultCard(props: {
  result: StructuredResultPresentation;
  error?: boolean;
  cached?: boolean;
  durationMs?: number;
}) {
  return (
    <PartCard
      variant="structured-result"
      class={props.error ? 'trx-structured-result--err' : ''}
      testId="structured-tool-result"
      root="section"
      icon={props.error ? 'alert' : 'check'}
      iconSize={14}
      layout="iconInHead"
      head={<span>{props.result.title}</span>}
    >
      <dl class="trx-structured-result__grid" data-testid="structured-tool-result-summary">
        <For each={props.result.rows.slice(0, 8)}>
          {(row) => (
            <div>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          )}
        </For>
      </dl>
      <details class="trx-structured-result__raw" data-testid="structured-tool-result-raw">
        <summary>Raw result</summary>
        <pre>{prettyJson(props.result.raw)}</pre>
      </details>
      <ToolTelemetryFooter cached={props.cached} durationMs={props.durationMs} />
    </PartCard>
  );
}

export function CommandResultCard(props: {
  command: string;
  text: string;
  children?: JSX.Element;
}) {
  return (
    <PartCard
      variant="command-result"
      testId="command-result-card"
      root="section"
      icon="tool"
      iconSize={14}
      layout="iconInHead"
      head={
        <>
          <span class="trx-command-result__label">Command result</span>
          <code>{props.command}</code>
        </>
      }
    >
      <div class="trx-command-result__body">
        <InlineMarkdown text={props.text} />
        {props.children}
      </div>
    </PartCard>
  );
}
