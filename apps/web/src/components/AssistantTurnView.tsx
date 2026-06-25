/**
 * ASSISTANT turn renderer — a FLAT, INDEXED LOG (RENDERING_SPEC.md).
 *
 * The assistant's work is an append-only sequence of delegation BLOCKS (one per
 * expert invocation). It renders like Claude Code's own terminal log: a flat,
 * indented log, NO boxes — indentation + a gutter marker only. Each block shows:
 *
 *   ● parent → agent           delegation header (one line)
 *     <task>                   the task that was sent — one inline muted sub-line
 *     name(args) · Nms         each tool the expert ran
 *     ⎿ <content-typed output> rendered BY CONTENT TYPE (image / diff / table /
 *                              markdown / json / text); only this collapses
 *     <agent result>           the expert's prose, rendered as markdown IN FULL
 *
 * Non-negotiables (RENDERING_SPEC):
 *   - FLAT: no card boxes around messages or blocks. Indentation only.
 *   - ONLY TOOL OUTPUT COLLAPSES — task / reasoning / result / answer in FULL.
 *   - REAL DEPTH INDENTATION from metadata.depth (visible left padding per level).
 *   - ONE consistent body font; differentiate by weight/color only.
 *   - Tool output rendered by CONTENT TYPE, never by tool name.
 *
 * PERFORMANCE: every block + tool carries a STABLE id so Solid's keyed <For>
 * only re-renders the block whose text changed during streaming.
 */
import { For, Show, createSignal } from 'solid-js';
import type { FileDiff, Part } from '@clio/core';
import { Icon } from './Icon.js';
import { MemoMarkdown } from './MemoMarkdown.js';
import { ImagePartView } from './TranscriptImagePartView.js';
import { PartView, type TranscriptDensity } from './TranscriptParts.js';
import type {
  AssistantTurnModel,
  DelegationBlock,
  DelegationToolCall,
} from './transcriptDelegationModel.js';
import {
  ToolResultView,
  type ReadWorkspaceImage,
} from './ToolResultContentView.js';
import './assistant-turn.css';

/** Cap visual indentation so deep chains stay on-screen. */
const MAX_INDENT_DEPTH = 6;

export function AssistantTurnView(props: {
  model: AssistantTurnModel;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  readWorkspaceImage?: ReadWorkspaceImage;
  messageId?: string;
}) {
  return (
    <div class="trx-turn" data-testid="assistant-turn">
      <Show when={props.model.routing}>
        {(routing) => (
          <div class="trx-turn__routing" data-testid="assistant-turn-routing">
            <Icon name="branch" size={12} />
            <span>
              routed to <strong>{routing().selected}</strong>
            </span>
            <Show when={routing().source}>
              <span class="trx-turn__routing-src">· {routing().source}</span>
            </Show>
          </div>
        )}
      </Show>

      <For each={props.model.blocks}>
        {(block) => (
          <DelegationBlockView block={block} readWorkspaceImage={props.readWorkspaceImage} />
        )}
      </For>

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
          <div class="trx-turn__answer-label">
            <Icon name="sparkle" size={13} />
            <span>Answer</span>
          </div>
          {/* The final answer renders in FULL — it never collapses. */}
          <div class="trx-turn__answer-body">
            <MemoMarkdown text={props.model.answer} />
          </div>
        </div>
      </Show>
    </div>
  );
}

/**
 * One delegation turn-block: a depth-indented, FLAT step (no box). The `●`
 * marker, the `parent → agent` header, the inline task sub-line, the ordered
 * tool calls, and the expert's markdown result.
 */
function DelegationBlockView(props: {
  block: DelegationBlock;
  readWorkspaceImage?: ReadWorkspaceImage;
}) {
  const block = () => props.block;
  const depth = () => Math.min(block().depth, MAX_INDENT_DEPTH);
  const isErr = () => /fail|block|error/i.test(block().status);
  return (
    <section
      class="trx-block"
      data-testid="assistant-turn-step"
      data-depth={depth()}
      data-agent={block().agent}
      style={{ '--trx-depth': String(depth()) }}
    >
      <div class="trx-block__step" data-testid="assistant-turn-delegation-header">
        <span class="trx-block__marker" aria-hidden="true">
          ●
        </span>
        <span class="trx-block__owner" classList={{ 'is-err': isErr() }}>
          <span class="trx-block__from">{block().parent}</span>
          <span class="trx-block__arrow" aria-hidden="true">
            →
          </span>
          <span class="trx-block__agent">{block().agent}</span>
        </span>
        <Show when={isErr()}>
          <span class="trx-block__status is-err">{block().status}</span>
        </Show>
      </div>

      {/* The delegated task: ONE inline muted sub-line, in FULL. Not a box. */}
      <Show when={block().task}>
        <div class="trx-block__task" data-testid="assistant-turn-task">
          {block().task}
        </div>
      </Show>

      <Show when={block().tools.length > 0}>
        <ul class="trx-block__tools" data-testid="assistant-turn-tools">
          <For each={block().tools}>
            {(tool) => (
              <ToolCallView tool={tool} readWorkspaceImage={props.readWorkspaceImage} />
            )}
          </For>
        </ul>
      </Show>

      {/* The expert's prose result — rendered in FULL, never collapsed. */}
      <Show when={block().result.trim()}>
        <div class="trx-block__result" data-testid="assistant-turn-result">
          <MemoMarkdown text={block().result} />
        </div>
      </Show>
    </section>
  );
}

/**
 * A single tool call: a "name(args) · Nms" header + the result rendered BY
 * CONTENT TYPE (image / diff / table / markdown / json / text). Only the tool
 * output collapses; a "show raw" disclosure reveals the underlying body.
 */
function ToolCallView(props: { tool: DelegationToolCall; readWorkspaceImage?: ReadWorkspaceImage }) {
  const tool = () => props.tool;
  return (
    <li class="trx-tool" data-testid="assistant-turn-tool" classList={{ 'is-err': !tool().ok }}>
      <div class="trx-tool__call">
        <Icon name="tool" size={12} />
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

      <div class="trx-tool__result">
        <span class="trx-tool__result-gutter" aria-hidden="true">
          ⎿
        </span>
        <div class="trx-tool__result-body">
          <ToolResultView
            content={tool().content}
            raw={tool().result}
            preview={tool().preview}
            readWorkspaceImage={props.readWorkspaceImage}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Render a passthrough part inside the flow. Image parts render as a capped
 * thumbnail that enlarges on click; other parts delegate to the per-type
 * renderer in the flat flow.
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
  return (
    <div class="trx-turn__passthrough">
      <PartView
        part={props.part}
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
