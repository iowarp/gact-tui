/**
 * UI component rendering the per-conversation execution trace (agent steps,
 * tools, handoffs) as an inline collapsible trace.
 */
import { For, Show } from 'solid-js';
import { formatDurationSeconds } from '../formatters.js';
import { Icon, type IconName } from './Icon.js';
import type { ExecutionTraceRow, ExecutionTraceTurn } from './conversationExecutionTrace.js';
import './conversation-execution-trace.css';

/**
 * Inline, opt-in per-turn execution strip rendered under an assistant turn in
 * the MAIN conversation (not just the Inspector). It distils the semantic
 * spine — agent invocations, expert handoffs, tool runs with wall-clock
 * timings, memory accesses — into a native `<details>` disclosure so the
 * trace stays out of the way until the user wants it. This mirrors the TUI's
 * inline execution timeline (`execution_render.go`) with a web-native
 * disclosure rather than glyph-drawn continuation rails.
 *
 * Additive: renders nothing when the turn has no trace rows.
 */
export function ConversationExecutionTrace(props: { trace?: ExecutionTraceTurn }) {
  const rows = () => props.trace?.rows ?? [];
  return (
    <Show when={rows().length > 0}>
      <details class="cx-trace" data-testid="conversation-execution-trace">
        <summary class="cx-trace__summary">
          <Icon name="chevron-right" size={13} class="cx-trace__caret" />
          <Icon name="metrics" size={13} class="cx-trace__lead" />
          <span class="cx-trace__title">Execution trace</span>
          <span class="cx-trace__chips" aria-hidden="true">
            <Show when={(props.trace?.agentCount ?? 0) > 1}>
              <span class="cx-trace__chip">{props.trace!.agentCount} agents</span>
            </Show>
            <Show when={(props.trace?.toolCount ?? 0) > 0}>
              <span class="cx-trace__chip">
                {props.trace!.toolCount} {props.trace!.toolCount === 1 ? 'tool' : 'tools'}
              </span>
            </Show>
          </span>
        </summary>
        <ol class="cx-trace__rows">
          <For each={rows()}>{(row) => <TraceRow row={row} />}</For>
        </ol>
      </details>
    </Show>
  );
}

function TraceRow(props: { row: ExecutionTraceRow }) {
  const row = () => props.row;
  return (
    <li
      class={`cx-trace__row cx-trace__row--${row().kind} cx-trace__row--${row().status}`}
      data-testid="cx-trace-row"
    >
      <span class="cx-trace__icon" aria-hidden="true">
        <Icon name={rowIcon(row().kind)} size={12} />
      </span>
      <span class="cx-trace__label">{row().label}</span>
      <Show when={row().agent && row().kind === 'tool'}>
        <span class="cx-trace__agent">{row().agent}</span>
      </Show>
      <span class="cx-trace__spacer" />
      <Show when={(row().durationMs ?? 0) > 0}>
        <span class="cx-trace__dur" title="Wall-clock duration">
          {formatDuration(row().durationMs as number)}
        </span>
      </Show>
    </li>
  );
}

function rowIcon(kind: ExecutionTraceRow['kind']): IconName {
  switch (kind) {
    case 'agent':
      return 'bot';
    case 'handoff':
      return 'branch';
    case 'tool':
      return 'tool';
    case 'memory':
      return 'memory';
    case 'turn':
      return 'alert';
    default:
      return 'circle';
  }
}

/** ms under 1000 → "{n}ms"; otherwise "{n.n}s" with one decimal. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${formatDurationSeconds(ms)}s`;
}
