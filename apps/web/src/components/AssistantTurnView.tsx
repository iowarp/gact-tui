/**
 * ASSISTANT turn renderer — an APPEND-ONLY ORDERED LOG (RENDERING_SPEC.md).
 *
 * The assistant's work is a flat, append-only sequence of ROWS in wire-arrival
 * order (see {@link AssistantTurnModel}). It renders like Claude Code's own
 * terminal log: flat, indented by delegation depth, NO boxes — a gutter marker
 * (`●`) on each agent turn, `⎿` on tool output. Row kinds:
 *
 *   ● parent → agent           a delegation header (+ the task sent, one sub-line)
 *   ● <agent>  <prose>         an agent's text turn, markdown IN FULL
 *   ● <agent>  <thinking>      an agent's reasoning step, muted, IN FULL
 *     name(args) · Nms         a tool the agent ran …
 *     ⎿ <content-typed output> … rendered BY CONTENT TYPE; only this collapses
 *
 * Non-negotiables (RENDERING_SPEC):
 *   - APPEND-ONLY: rows are keyed by part id; the turn is only appended to /
 *     updated in place, never re-grouped or re-ordered.
 *   - FLAT: no card boxes. Indentation (real delegation depth) only.
 *   - ONE consistent body font; differentiate by weight/color only.
 *   - ONE marker PER AGENT TURN, not just per delegation.
 *   - Tool output rendered by CONTENT TYPE, never by tool name; only it collapses.
 */
import { For, Show, createSignal } from 'solid-js';
import type { FileDiff, Part } from '@clio/core';
import { Icon } from './Icon.js';
import { MemoMarkdown } from './MemoMarkdown.js';
import { ImagePartView } from './TranscriptImagePartView.js';
import { PartView, type TranscriptDensity } from './TranscriptParts.js';
import type {
  DelegationRow,
  ProviderThinking,
  ReasoningRow,
  ReturnRow,
  RoutingRow,
  TextRow,
  ToolRow,
  TurnRow,
} from './transcriptDelegationModel.js';
import {
  ToolResultView,
  type ReadWorkspaceImage,
} from './ToolResultContentView.js';
import './assistant-turn.css';

/** Cap visual indentation so deep chains stay on-screen. */
const MAX_INDENT_DEPTH = 6;

function depthStyle(depth: number) {
  const d = Math.min(Math.max(depth, 0), MAX_INDENT_DEPTH);
  return { 'data-depth': d, style: { '--trx-depth': String(d) } as Record<string, string> };
}

export function AssistantTurnView(props: {
  /** The ordered append-only row log. A reconcile(key:'id') store from
   *  MessageView, so this <For> keeps each row's DOM across SSE deltas and only
   *  the changed/new row re-renders (incremental paint). */
  rows: readonly TurnRow[];
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  readWorkspaceImage?: ReadWorkspaceImage;
  messageId?: string;
}) {
  const finalTextIndex = () => {
    for (let i = props.rows.length - 1; i >= 0; i--) {
      if (props.rows[i]?.kind === 'text') return i;
    }
    return -1;
  };
  return (
    <div class="trx-turn" data-testid="assistant-turn">
      <For each={props.rows}>
        {(row, i) => (
          <TurnRowView
            row={row}
            isFinalAnswer={row.kind === 'text' && i() === finalTextIndex()}
            showAgent={i() === 0 || owningAgent(row) !== owningAgent(props.rows[i() - 1]!)}
            {...props}
          />
        )}
      </For>
    </div>
  );
}

/** The agent whose TURN a row belongs to: the emitter, except a delegation is
 *  the PARENT's turn. Drives the "name shown once atop a contiguous block". */
function owningAgent(row: TurnRow): string {
  if (row.kind === 'delegation') return row.parent;
  if (row.kind === 'return') return row.agent;
  if (row.kind === 'passthrough') return '';
  return (row as { agent?: string }).agent ?? '';
}

/** `▎<agent>` — the agent's name, shown ONCE atop its contiguous block (it
 *  reappears only when the owning agent changes, e.g. on resume). Colored by
 *  agent via `data-agent`; never repeated per turn. */
function AgentHeader(props: { agent: string; depth: number; providerThinking?: ProviderThinking }) {
  return (
    <Show when={props.agent}>
      <div
        class="trx-row__agenthdr"
        data-agent={props.agent}
        data-testid="assistant-turn-agent"
        {...depthStyle(props.depth)}
      >
        <span class="trx-row__agenthdr-name">{props.agent}</span>
        <Show when={props.providerThinking}>
          {(thinking) => <ProviderThinkingDisclosure thinking={thinking()} />}
        </Show>
      </div>
    </Show>
  );
}

function ProviderThinkingDisclosure(props: { thinking: ProviderThinking }) {
  const countLabel = () => {
    if (props.thinking.tokens != null) return `${props.thinking.tokens} tokens`;
    const chars = props.thinking.chars ?? props.thinking.text.length;
    return `${chars} chars`;
  };
  return (
    <details class="trx-provider-thinking" data-testid="assistant-turn-provider-thinking">
      <summary>
        <Icon
          name="chevron-right"
          size={12}
          class="trx-provider-thinking__chevron"
          label="Toggle provider thinking"
        />
        <span class="trx-provider-thinking__label">thinking</span>
        <span class="trx-provider-thinking__count">({countLabel()})</span>
        <span class="trx-provider-thinking__source">{props.thinking.source}</span>
      </summary>
      <div class="trx-provider-thinking__body">
        <MemoMarkdown text={props.thinking.text} />
      </div>
    </details>
  );
}

function TurnRowView(props: {
  row: TurnRow;
  showAgent: boolean;
  isFinalAnswer: boolean;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  readWorkspaceImage?: ReadWorkspaceImage;
  messageId?: string;
}) {
  const row = props.row;
  switch (row.kind) {
    case 'delegation':
      return <DelegationRowView row={row} showAgent={props.showAgent} />;
    case 'text':
      return <TextRowView row={row} showAgent={props.showAgent} isFinalAnswer={props.isFinalAnswer} />;
    case 'reasoning':
      return <ReasoningRowView row={row} showAgent={props.showAgent} />;
    case 'tool':
      return (
        <ToolRowView
          row={row}
          showAgent={props.showAgent}
          readWorkspaceImage={props.readWorkspaceImage}
        />
      );
    case 'routing':
      return <RoutingRowView row={row} />;
    case 'return':
      return <ReturnRowView row={row} showAgent={props.showAgent} />;
    case 'passthrough':
      return (
        <PassthroughRowView
          row={row}
          density={props.density}
          onOpenDiff={props.onOpenDiff}
          onPinFile={props.onPinFile}
          imagePartsSupported={props.imagePartsSupported}
          messageId={props.messageId}
        />
      );
  }
}

/** A delegation = the PARENT's turn: `● → <child>` + the task (in FULL). The
 *  parent's name shows once via the block header (not repeated here). */
function DelegationRowView(props: { row: DelegationRow; showAgent: boolean }) {
  const row = () => props.row;
  const isErr = () => /fail|block|error/i.test(row().status);
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader
          agent={row().parent}
          depth={row().depth}
          providerThinking={row().providerThinking}
        />
      </Show>
      <section
        class="trx-row trx-row--delegation"
        data-testid="assistant-turn-step"
        data-agent={row().agent}
        {...depthStyle(row().depth)}
      >
        <div class="trx-row__head" data-testid="assistant-turn-delegation-header">
          <span class="trx-row__marker" aria-hidden="true">
            ●
          </span>
          <span class="trx-row__owner trx-row__owner--call" classList={{ 'is-err': isErr() }}>
            call(<span class="trx-row__agent">{row().agent}</span>)
          </span>
          <Show when={isErr()}>
            <span class="trx-row__status is-err">{row().status}</span>
          </Show>
        </div>
        <Show when={row().task}>
          <div class="trx-row__task" data-testid="assistant-turn-task">
            <span class="trx-tool__result-gutter" aria-hidden="true">
              ⎿
            </span>
            <span>{row().task}</span>
          </div>
        </Show>
      </section>
    </>
  );
}

/** `●` then the agent's prose, markdown IN FULL. One ● marker per turn; the
 *  agent name comes from the block header, not repeated on each turn. */
function TextRowView(props: { row: TextRow; showAgent: boolean; isFinalAnswer: boolean }) {
  const row = () => props.row;
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader
          agent={row().agent}
          depth={row().depth}
          providerThinking={row().providerThinking}
        />
      </Show>
      <section
        class="trx-row trx-row--text"
        data-testid={props.isFinalAnswer ? 'assistant-turn-answer' : 'assistant-turn-text'}
        data-agent={row().agent}
        {...depthStyle(row().depth)}
      >
        <div class="trx-row__head">
          <span class="trx-row__marker" aria-hidden="true">
            ●
          </span>
        </div>
        <div class="trx-row__body" data-testid="assistant-turn-result">
          <MemoMarkdown text={row().text} />
        </div>
      </section>
    </>
  );
}

/** An agent's `thinking` step — same shape, muted, but still a ● turn. */
function ReasoningRowView(props: { row: ReasoningRow; showAgent: boolean }) {
  const row = () => props.row;
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader
          agent={row().agent}
          depth={row().depth}
          providerThinking={row().providerThinking}
        />
      </Show>
      <section
        class="trx-row trx-row--reason"
        data-testid="assistant-turn-reasoning"
        data-agent={row().agent}
        {...depthStyle(row().depth)}
      >
        <div class="trx-row__head">
          <span class="trx-row__marker trx-row__marker--dim" aria-hidden="true">
            ●
          </span>
        </div>
        <div class="trx-row__body trx-row__body--dim" data-testid="assistant-turn-reasoning-body">
          <MemoMarkdown text={row().text} />
        </div>
      </section>
    </>
  );
}

/** A tool turn: `● <thought>` then `name(args) · Nms` + the content-typed
 *  result (⎿). One ● turn = the step's reasoning (clio #732) + the tool. */
function ToolRowView(props: {
  row: ToolRow;
  showAgent: boolean;
  readWorkspaceImage?: ReadWorkspaceImage;
}) {
  const row = () => props.row;
  const hasThought = () => row().thought.trim().length > 0;
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader
          agent={row().agent}
          depth={row().depth}
          providerThinking={row().providerThinking}
        />
      </Show>
      <div
        class="trx-row trx-row--tool"
        data-testid="assistant-turn-tool"
        classList={{ 'is-err': !row().ok }}
        {...depthStyle(row().depth)}
      >
        <div class="trx-row__head" classList={{ 'trx-row__head--tool-call': !hasThought() }}>
          <span class="trx-row__marker" aria-hidden="true">
            ●
          </span>
          <Show when={hasThought()} fallback={<ToolCallLine row={row()} />}>
            <div class="trx-row__body trx-tool__thought" data-testid="assistant-turn-tool-thought">
              <MemoMarkdown text={row().thought} />
            </div>
          </Show>
        </div>
        <Show when={hasThought()}>
          <ToolCallLine row={row()} />
        </Show>
      <Show when={toolHasResult(row())}>
        <div class="trx-tool__result">
          <span class="trx-tool__result-gutter" aria-hidden="true">
            ⎿
          </span>
          <div class="trx-tool__result-body">
            <ToolResultView
              content={row().content}
              raw={row().result}
              preview={row().preview}
              readWorkspaceImage={props.readWorkspaceImage}
            />
          </div>
        </div>
      </Show>
      </div>
    </>
  );
}

/** The orchestrator's routing decision — a subtle inline chip. */
function ToolCallLine(props: { row: ToolRow }) {
  const row = () => props.row;
  return (
    <div class="trx-tool__call">
      <Icon name="tool" size={12} />
      <span class="trx-tool__name">{row().name}</span>
      <Show when={row().argsSummary}>
        <span class="trx-tool__args">({row().argsSummary})</span>
      </Show>
      <span class="trx-tool__meta">
        <Show when={!row().ok}>
          <span class="trx-tool__badge is-err">failed</span>
        </Show>
        <Show when={row().durationMs != null}>
          <span class="trx-tool__dur">{Math.round(row().durationMs!)}ms</span>
        </Show>
      </span>
    </div>
  );
}

function RoutingRowView(props: { row: RoutingRow }) {
  const row = () => props.row;
  return (
    <div class="trx-row trx-row--routing" data-testid="assistant-turn-routing" {...depthStyle(row().depth)}>
      <Icon name="branch" size={12} />
      <span>
        routed to <strong>{row().selected}</strong>
      </span>
      <Show when={row().source}>
        <span class="trx-row__routing-src">· {row().source}</span>
      </Show>
    </div>
  );
}

function ReturnRowView(props: { row: ReturnRow; showAgent: boolean }) {
  const row = () => props.row;
  const [open, setOpen] = createSignal(false);
  const hasDetails = () => row().raw.trim().length > 0;
  const responseCount = () => {
    if (row().tokens != null) return `${row().tokens} tokens`;
    const chars = row().chars ?? row().raw.length;
    return `${chars} chars`;
  };
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader
          agent={row().agent}
          depth={row().depth}
          providerThinking={row().providerThinking}
        />
      </Show>
      <section
        class="trx-row trx-row--return"
        data-testid="assistant-turn-return"
        data-agent={row().agent}
        {...depthStyle(row().depth)}
      >
        <div class="trx-row__head">
          <span class="trx-row__marker trx-row__marker--return" aria-hidden="true">
            ↩
          </span>
          <span class="trx-row__owner">
            <span class="trx-row__agent">{row().agent}</span>
            <span class="trx-row__arrow" aria-hidden="true">
              returns to
            </span>
            <span class="trx-row__agent">{row().parent}</span>
          </span>
          <Show when={hasDetails()}>
            <button
              type="button"
              class="trx-return__toggle"
              aria-expanded={open()}
              data-testid="assistant-turn-return-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              {open() ? 'hide response' : `show response (${responseCount()})`}
            </button>
          </Show>
        </div>
        <Show when={row().text}>
          <div class="trx-row__body trx-row__body--return" data-testid="assistant-turn-return-body">
            <MemoMarkdown text={row().text} />
          </div>
        </Show>
        <Show when={open() && hasDetails()}>
          <pre class="trx-return__raw" data-testid="assistant-turn-return-raw">
            {row().raw}
          </pre>
        </Show>
      </section>
    </>
  );
}

/** Whether a tool row carries any renderable output (omit the empty `⎿` row). */
function toolHasResult(row: ToolRow): boolean {
  if (row.content.kind === 'image') return Boolean(row.imagePath || row.preview.trim());
  if (row.content.kind === 'table') return row.content.columns.length > 0;
  return Boolean(row.preview.trim() || row.result.trim());
}

/** A passthrough part rendered in-flow by its own per-type view. */
function PassthroughRowView(props: {
  row: { part: Part; depth: number };
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  messageId?: string;
}) {
  const part = props.row.part;
  if (part.type === 'image') {
    return (
      <div class="trx-row trx-row--passthrough" {...depthStyle(props.row.depth)}>
        <ImageThumbPartView part={part} imagePartsSupported={props.imagePartsSupported} />
      </div>
    );
  }
  return (
    <div class="trx-row trx-row--passthrough" {...depthStyle(props.row.depth)}>
      <PartView
        part={part}
        density={props.density}
        onOpenDiff={props.onOpenDiff}
        onPinFile={props.onPinFile}
        imagePartsSupported={props.imagePartsSupported}
        messageId={props.messageId}
      />
    </div>
  );
}

/** Image artifact: a capped thumbnail that enlarges to a full overlay on click. */
function ImageThumbPartView(props: { part: Part; imagePartsSupported?: boolean }) {
  const [enlarged, setEnlarged] = createSignal(false);
  return (
    <div class="trx-turn__passthrough">
      <button
        type="button"
        class="trx-image-thumb"
        classList={{ 'is-enlarged': enlarged() }}
        data-testid="trx-image-thumb"
        aria-expanded={enlarged()}
        title={enlarged() ? 'click to shrink' : 'click to enlarge'}
        onClick={(e) => {
          e.stopPropagation();
          setEnlarged((v) => !v);
        }}
      >
        <ImagePartView part={props.part} imagePartsSupported={props.imagePartsSupported} />
        <span class="trx-image-thumb__hint" data-testid="trx-image-thumb-hint">
          {enlarged() ? 'collapse' : 'click to enlarge'}
        </span>
      </button>
    </div>
  );
}
