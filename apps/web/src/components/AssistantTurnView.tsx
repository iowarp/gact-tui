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
import { MemoMarkdown, StreamingMarkdown } from './MemoMarkdown.js';
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
  /** True while this turn's message is still streaming — the LAST row is the one
   *  actively growing, so it renders plain (no per-token re-parse) for smoothness. */
  streaming?: boolean;
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
            showAgent={showAgentHeader(props.rows, i())}
            isStreamingTail={(props.streaming ?? false) && i() === props.rows.length - 1}
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

/** Whether to show the `▎<agent>` name atop this row: when it starts a new agent
 *  block. Compares against the previous HEADER-BEARING row — routing/passthrough
 *  rows render no name, so they must NOT suppress the header of the content row that
 *  follows them. This is the fix for `▎main` flashing in a beat late: a
 *  routing_decision streams first as row 0 (nameless) and, with the old immediate
 *  `rows[i-1]` compare, made main's first thinking/answer read as "same agent → no
 *  name" until the rows settled. */
function showAgentHeader(rows: readonly TurnRow[], i: number): boolean {
  const cur = owningAgent(rows[i]!);
  if (!cur) return false;
  for (let j = i - 1; j >= 0; j--) {
    const prev = rows[j]!;
    if (prev.kind === 'routing' || prev.kind === 'passthrough') continue;
    return owningAgent(prev) !== cur;
  }
  return true;
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
  // Collapsed by default; the count in the summary ticks live as the thinking
  // streams. The body is rendered ONLY when opened, so the growing hidden thinking
  // is never re-parsed per delta (and opening it mid-stream shows it live).
  const [open, setOpen] = createSignal(false);
  const countLabel = () => {
    if (props.thinking.tokens != null) return `${props.thinking.tokens} tokens`;
    const chars = props.thinking.chars ?? props.thinking.text.length;
    return `${chars} chars`;
  };
  return (
    <details
      class="trx-provider-thinking"
      data-testid="assistant-turn-provider-thinking"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <Icon
          name="chevron-right"
          size={12}
          class="trx-provider-thinking__chevron"
          label="Toggle provider thinking"
        />
        <span class="trx-provider-thinking__label">thinking</span>
        <span class="trx-provider-thinking__count">({countLabel()})</span>
      </summary>
      <Show when={open()}>
        <div class="trx-provider-thinking__body">
          <MemoMarkdown text={props.thinking.text} />
        </div>
      </Show>
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
  isStreamingTail?: boolean;
}) {
  const row = props.row;
  const body = () => {
    switch (row.kind) {
      case 'delegation':
        return <DelegationRowView row={row} showAgent={props.showAgent} />;
      case 'text':
        return (
          <TextRowView
            row={row}
            showAgent={props.showAgent}
            isFinalAnswer={props.isFinalAnswer}
            streaming={props.isStreamingTail}
          />
        );
      case 'reasoning':
        return (
          <ReasoningRowView row={row} showAgent={props.showAgent} streaming={props.isStreamingTail} />
        );
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
  };
  // Provider thinking shows ON EVERY call/step that has it. Block-boundary rows
  // surface it via AgentHeader (below the agent name); mid-block rows (e.g. a
  // tool call after another tool in the same agent block) get their own
  // disclosure here, so the chevron is per-call, not once per agent block.
  const rowDepth = (row as { depth?: number }).depth ?? 0;
  return (
    <>
      <Show when={!props.showAgent && row.kind !== 'return' && rowProviderThinking(row)}>
        {(thinking) => (
          <div class="trx-row__thinking-standalone" {...depthStyle(rowDepth)}>
            <ProviderThinkingDisclosure thinking={thinking()} />
          </div>
        )}
      </Show>
      {body()}
    </>
  );
}

/** The provider-thinking attached to a row, if any (text/tool/delegation/return). */
function rowProviderThinking(row: TurnRow): ProviderThinking | undefined {
  return (row as { providerThinking?: ProviderThinking }).providerThinking;
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
function TextRowView(props: {
  row: TextRow;
  showAgent: boolean;
  isFinalAnswer: boolean;
  streaming?: boolean;
}) {
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
          <StreamingMarkdown text={row().text} streaming={props.streaming} />
        </div>
      </section>
    </>
  );
}

/** An agent's `thinking`. The LIVE path emits an empty-text reasoning row whose
 *  `providerThinking` is the streaming SDK thinking — it renders ONLY as the
 *  collapsed `thinking ▾` disclosure (via the agent header, or the standalone
 *  disclosure when mid-block), no `●` body. A reasoning row WITH text (persisted
 *  DSPy reasoning) still renders the muted `●` body. */
function ReasoningRowView(props: { row: ReasoningRow; showAgent: boolean; streaming?: boolean }) {
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
      <Show when={row().text.trim()}>
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
            <StreamingMarkdown text={row().text} streaming={props.streaming} />
          </div>
        </section>
      </Show>
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
          <div class="trx-tool__call-row">
            <span class="trx-row__marker" aria-hidden="true">
              ●
            </span>
            <ToolCallLine row={row()} />
          </div>
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
  // A return is a COLLAPSED one-liner: `↩ child returns to parent  thinking ▾
  // show details ▾`. Nothing is shown by default. Two independent disclosures sit
  // on the line: "thinking" (the reasoning the child's turn used) and "show
  // details" (the return content — the readable summary, plus the raw payload
  // when it carries more than the summary).
  const thinking = () => row().providerThinking;
  const hasContent = () => row().text.trim().length > 0 || row().raw.trim().length > 0;
  const showRaw = () => {
    const raw = row().raw.trim();
    return raw.length > 0 && raw !== row().text.trim();
  };
  const detailsCount = () => {
    if (row().tokens != null) return `${row().tokens} tokens`;
    const chars = row().chars ?? (row().text || row().raw).length;
    return `${chars} chars`;
  };
  return (
    <>
      <Show when={props.showAgent}>
        <AgentHeader agent={row().agent} depth={row().depth} />
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
          <Show when={thinking()}>
            {(t) => <ProviderThinkingDisclosure thinking={t()} />}
          </Show>
          <Show when={hasContent()}>
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
              {open() ? 'hide details' : `show details (${detailsCount()})`}
            </button>
          </Show>
        </div>
        <Show when={open() && hasContent()}>
          <div class="trx-row__body trx-row__body--return" data-testid="assistant-turn-return-body">
            <Show when={row().text}>
              <MemoMarkdown text={row().text} />
            </Show>
            <Show when={showRaw()}>
              <pre class="trx-return__raw" data-testid="assistant-turn-return-raw">
                {row().raw}
              </pre>
            </Show>
          </div>
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

/** Image artifact: a large collapsed preview that expands on click. */
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
        title={enlarged() ? 'collapse image' : 'show full image'}
        onClick={(e) => {
          e.stopPropagation();
          setEnlarged((v) => !v);
        }}
      >
        <span class="trx-image-frame">
          <ImagePartView part={props.part} imagePartsSupported={props.imagePartsSupported} />
        </span>
        <span class="trx-image-thumb__hint" data-testid="trx-image-thumb-hint">
          {enlarged() ? 'collapse' : 'show full image'}
        </span>
      </button>
    </div>
  );
}
