/**
 * TUI-style ASSISTANT turn renderer.
 *
 * Replaces the flat "wall of bordered cards" (one box per part) with a flowing,
 * indented transcript that mirrors the TUI's two readability semantics:
 *
 *   - delegation-DEPTH INDENTATION — each delegation step is indented by its
 *     depth with a left rule, labelled by agent + status, showing the FULL
 *     stripped model prose (max information, nothing summarised away).
 *   - tool-output / long-content COMPACTION — long prose, tool returns, diffs
 *     and images show a top preview with a "+K lines · expand" affordance
 *     (see CollapsibleContent).
 *
 * The final answer renders prominently as full markdown; image artifacts render
 * inline. Routing is a subtle chip kept out of the main flow. The clean model
 * is produced by buildAssistantTurnModel (pure, unit-tested).
 */
import { For, Show } from 'solid-js';
import type { FileDiff, Part } from '@clio/core';
import { Icon } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import { CollapsibleBlock, CollapsibleText, COLLAPSE_THRESHOLD } from './CollapsibleContent.js';
import { PartView, type TranscriptDensity } from './TranscriptParts.js';
import type { AssistantTurnModel, DelegationStep } from './transcriptDelegationModel.js';
import './assistant-turn.css';

/** Cap visual indentation so deep chains stay on-screen. */
const MAX_INDENT_DEPTH = 4;

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

      <For each={props.model.steps}>
        {(step) => <DelegationStepView step={step} />}
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
          <InlineMarkdown text={props.model.answer} />
        </div>
      </Show>
    </div>
  );
}

function DelegationStepView(props: { step: DelegationStep }) {
  const step = () => props.step;
  const depth = () => Math.min(step().depth, MAX_INDENT_DEPTH);
  return (
    <section
      class="trx-step"
      data-testid="assistant-turn-step"
      data-depth={depth()}
      data-agent={step().agent}
      style={{ '--trx-depth': String(depth()) }}
    >
      <div class="trx-step__rule" aria-hidden="true" />
      <div class="trx-step__body">
        <header class="trx-step__head">
          <Icon name={depth() === 0 ? 'bot' : 'branch'} size={12} />
          <span class="trx-step__agent">{step().agent}</span>
          <Show when={step().parent}>
            <span class="trx-step__parent">← {step().parent}</span>
          </Show>
          <span
            class="trx-step__status"
            classList={{ 'is-err': /fail|block|error/i.test(step().status) }}
          >
            {step().status}
          </span>
        </header>
        <div class="trx-step__text">
          <CollapsibleText text={step().text} threshold={COLLAPSE_THRESHOLD} />
        </div>
      </div>
    </section>
  );
}

/**
 * Render a passthrough part inside the flow. Long text-bearing parts are
 * clamped with the same top-preview+expand affordance; structured parts
 * (tool_call/file_diff/image/…) delegate to their existing per-type renderer
 * wrapped in a CollapsibleBlock so big outputs do not dominate the transcript.
 */
function PassthroughPartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  imagePartsSupported?: boolean;
  messageId?: string;
}) {
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
