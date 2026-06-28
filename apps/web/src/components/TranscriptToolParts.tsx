/**
 * Inline transcript view for tool-call parts: invocation header, arguments, and
 * result/error disclosure with telemetry.
 */
import { For, Show, type JSX } from 'solid-js';
import type { PartToolCall, PartToolResult } from '@clio/core';
import { toolInputRows } from '../presentation.js';
import { Icon } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import { toolResultBody } from './TranscriptToolPartsModel.js';
import { PartCard } from './TranscriptPartCard.js';
import { analyzeToolResult } from './toolResultPreview.js';
import { ToolResultView } from './ToolResultContentView.js';

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
  // Searching keeps the raw highlight loop authoritative, so render the plain
  // body. Otherwise render BY CONTENT TYPE (image / diff / table / markdown /
  // json / text) — backend-agnostic, never keyed off the tool name.
  if (props.searchQuery?.trim()) {
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
  const analysis = analyzeToolResult(body);
  return (
    <div
      class={'trx-toolresult ' + (p.is_error ? 'trx-toolresult--err' : '')}
      data-testid="content-typed-tool-result"
    >
      <Icon name={p.is_error ? 'alert' : 'check'} size={14} class="trx-toolresult__icon" />
      <div class="trx-toolresult__main">
        <ToolResultView content={analysis.content} raw={analysis.full} preview={analysis.preview} />
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
