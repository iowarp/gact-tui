/**
 * ASSISTANT turn renderer — a CHAT OF TURNS.
 *
 * The assistant's work is an append-only sequence of clearly-separated
 * delegation BLOCKS (one per expert invocation), NOT one container everything
 * piles into. Each block is a stable element in the log and renders its own
 * explicit, ordered structure (mirrors transcriptDelegationModel):
 *
 *   main → <expert>            delegation header
 *   ↳ task                     the task main actually SENT to the expert
 *   ⚙ tool(args) / ⎿ result    each tool the expert ran, in order
 *   <expert> result            the expert's prose/result, rendered as markdown
 *
 * The good parts are kept: delegation-DEPTH INDENTATION (left rule offset per
 * depth) and tool-output / long-content COMPACTION (top preview + expand via
 * CollapsibleContent). The final answer renders prominently as markdown; image
 * artifacts render inline.
 *
 * PERFORMANCE: every block + tool carries a STABLE id, so Solid's keyed <For>
 * (`each` over the same identity) only re-renders the block whose text changed
 * during streaming — not the whole transcript. Markdown is parsed via the
 * memoized MemoMarkdown so an unchanged block's prose is not re-parsed per
 * token, and off-screen blocks use `content-visibility:auto` so scrolling a long
 * transcript stays cheap.
 */
import { For, Show, createSignal } from 'solid-js';
import type { FileDiff, Part } from '@clio/core';
import { Icon } from './Icon.js';
import { CollapsibleBlock, CollapsibleText, COLLAPSE_THRESHOLD } from './CollapsibleContent.js';
import { ImagePartView } from './TranscriptImagePartView.js';
import { PartView, type TranscriptDensity } from './TranscriptParts.js';
import type {
  AssistantTurnModel,
  DelegationBlock,
  DelegationToolCall,
} from './transcriptDelegationModel.js';
import './assistant-turn.css';

/** Cap visual indentation so deep chains stay on-screen. */
const MAX_INDENT_DEPTH = 4;

/** The final answer gets a generous preview budget — it is the headline of the
 *  turn — but still compacts when it runs very long. */
const ANSWER_THRESHOLD = 16;

/** Tool results compact aggressively — they're supporting evidence, not prose. */
const TOOL_RESULT_THRESHOLD = 4;

function countLines(s: string): number {
  if (!s) return 0;
  return s.split('\n').length;
}

export function AssistantTurnView(props: {
  model: AssistantTurnModel;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  messageId?: string;
}) {
  return (
    <div class="trx-turn" data-testid="assistant-turn">
      <Show when={props.model.routing}>
        {(routing) => (
          <div class="trx-turn__routing" data-testid="assistant-turn-routing">
            <Icon name="branch" size={11} />
            <span>
              routed to <strong>{routing().selected}</strong>
            </span>
            <Show when={routing().source}>
              <span class="trx-turn__routing-src">· {routing().source}</span>
            </Show>
          </div>
        )}
      </Show>

      {/* Keyed by stable block id: a streaming delta only re-renders the block
          whose identity is unchanged but whose text grew — not the whole list. */}
      <For each={props.model.blocks}>{(block) => <DelegationBlockView block={block} />}</For>

      <For each={props.model.passthrough}>
        {(part) => (
          <PassthroughPartView
            part={part}
            density={props.density}
            onOpenDiff={props.onOpenDiff}
            onPinFile={props.onPinFile}
            imagePartsSupported={props.imagePartsSupported}
            messageId={props.messageId}
          />
        )}
      </For>

      <Show when={props.model.answer.trim()}>
        <div class="trx-turn__answer" data-testid="assistant-turn-answer">
          {/* The final answer is prominent, but a very long answer still
              compacts to a top preview + expand (same semantics as tools). */}
          <CollapsibleText text={props.model.answer} threshold={ANSWER_THRESHOLD} />
        </div>
      </Show>
    </div>
  );
}

/**
 * One delegation turn-block: a depth-indented card with a left rule, the
 * `main → expert` header, the task that was sent, the ordered tool calls, and
 * the expert's markdown result.
 */
function DelegationBlockView(props: { block: DelegationBlock }) {
  const block = () => props.block;
  const depth = () => Math.min(block().depth, MAX_INDENT_DEPTH);
  return (
    <section
      class="trx-block"
      data-testid="assistant-turn-step"
      data-depth={depth()}
      data-agent={block().agent}
      style={{ '--trx-depth': String(depth()) }}
    >
      <div class="trx-block__rule" aria-hidden="true" />
      <div class="trx-block__body">
        <header class="trx-block__head" data-testid="assistant-turn-delegation-header">
          <Icon name="branch" size={12} />
          <span class="trx-block__from">{block().parent}</span>
          <span class="trx-block__arrow" aria-hidden="true">
            →
          </span>
          <span class="trx-block__agent">{block().agent}</span>
          <span
            class="trx-block__status"
            classList={{ 'is-err': /fail|block|error/i.test(block().status) }}
          >
            {block().status}
          </span>
        </header>

        <Show when={block().task}>
          <div class="trx-block__task" data-testid="assistant-turn-task">
            <span class="trx-block__task-label" aria-hidden="true">
              ↳ task
            </span>
            <CollapsibleText text={block().task} threshold={TOOL_RESULT_THRESHOLD} />
          </div>
        </Show>

        <Show when={block().tools.length > 0}>
          <ul class="trx-block__tools" data-testid="assistant-turn-tools">
            <For each={block().tools}>{(tool) => <ToolCallView tool={tool} />}</For>
          </ul>
        </Show>

        <Show when={block().result.trim()}>
          <div class="trx-block__result" data-testid="assistant-turn-result">
            <CollapsibleText text={block().result} threshold={COLLAPSE_THRESHOLD} />
          </div>
        </Show>
      </div>
    </section>
  );
}

/** A single tool call: a "⚙ name(args)" line + a compacted "⎿ result" block. */
function ToolCallView(props: { tool: DelegationToolCall }) {
  const tool = () => props.tool;
  return (
    <li class="trx-tool" data-testid="assistant-turn-tool" classList={{ 'is-err': !tool().ok }}>
      <div class="trx-tool__call">
        <Icon name="tool" size={11} />
        <span class="trx-tool__name">{tool().name}</span>
        <Show when={tool().argsSummary}>
          <span class="trx-tool__args">({tool().argsSummary})</span>
        </Show>
        <span class="trx-tool__meta">
          <Show when={!tool().ok}>
            <span class="trx-tool__badge is-err">failed</span>
          </Show>
          <Show when={tool().cached}>
            <span class="trx-tool__badge">cached</span>
          </Show>
          <Show when={tool().durationMs != null}>
            <span class="trx-tool__dur">{Math.round(tool().durationMs!)}ms</span>
          </Show>
        </span>
      </div>
      <Show when={tool().result.trim()}>
        <div class="trx-tool__result">
          <span class="trx-tool__result-gutter" aria-hidden="true">
            ⎿
          </span>
          {/* Raw tool output renders as plain text (not markdown) and compacts. */}
          <CollapsibleText text={tool().result} threshold={TOOL_RESULT_THRESHOLD} plain />
        </div>
      </Show>
    </li>
  );
}

/**
 * Render a passthrough part inside the flow. Image parts render as a capped
 * thumbnail that enlarges on click; long text-bearing parts (tool returns,
 * diffs) are clamped to a top preview + expand — the same compaction semantics
 * as tool returns, delegating to the existing per-type renderer.
 */
function PassthroughPartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  messageId?: string;
}) {
  if (props.part.type === 'image') {
    return <ImageThumbPartView part={props.part} imagePartsSupported={props.imagePartsSupported} />;
  }
  const p = props.part as Part & {
    output?: string;
    content?: string;
    unified_diff?: string;
    new_content?: string;
  };
  // Estimate the part's vertical footprint to decide whether to clamp.
  const body =
    (typeof p.output === 'string' && p.output) ||
    (typeof p.content === 'string' && p.content) ||
    (typeof p.unified_diff === 'string' && p.unified_diff) ||
    (typeof p.new_content === 'string' && p.new_content) ||
    '';
  const lines = countLines(body);
  return (
    <div class="trx-turn__passthrough">
      <CollapsibleBlock lines={lines} threshold={COLLAPSE_THRESHOLD}>
        <PartView
          part={props.part}
          density={props.density}
          onOpenDiff={props.onOpenDiff}
          onPinFile={props.onPinFile}
          imagePartsSupported={props.imagePartsSupported}
          messageId={props.messageId}
        />
      </CollapsibleBlock>
    </div>
  );
}

/**
 * Image artifact: a capped thumbnail (top preview) that enlarges to a full
 * overlay on click — the image analogue of the tool-output top-preview+expand.
 */
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
