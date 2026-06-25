/**
 * Renders a projected multi-agent execution turn as an INDENTED, INTERACTIVE
 * tree — TUI parity (cf. tui/internal/ui/execution_render.go). Each node is
 * indented by its delegation depth (one level deeper per delegation child).
 * Agent text, delegation headers
 * ("↳ parent → child"), react steps (thought + tool call + collapsed
 * observation with click-to-expand), and expert reports each render with their
 * own per-kind content, reusing the existing projection content helpers so the
 * tree shows exactly what the old flat-text view produced — but structured.
 *
 * Replaces the prior flat `formatProjectedExecution()` text blob, which threw
 * away the hierarchy + interactivity. A copy-to-clipboard fallback keeps the
 * plain-text rendering reachable.
 */
import { For, Show, createMemo } from 'solid-js';
import type { FileDiff, Part } from '@clio/core';
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';
import {
  formatArgs,
  formatProjectedExecution,
  toolDisplayName,
} from './executionProjectionPreview.js';
import { observationPreview } from './executionObservationPreview.js';
import {
  carriesArtifact,
  reportPreview,
  structuredAgentTextPreview,
  stripControlContracts,
} from './executionProjectionReport.js';
import { objectValue, stringValue } from './executionProjectionHelpers.js';
import { FileDiffPartView } from './TranscriptFileDiffPartView.js';
import { ImagePartView } from './TranscriptImagePartView.js';
import { Icon } from './Icon.js';
import './execution-tree.css';

/** Pixels of indentation added per delegation depth (mirrors the TUI's
 *  two-space `executionIndent`). Content (thought/observation) sits one extra
 *  step in, matching the TUI's `executionContentIndent`. */
const INDENT_STEP_PX = 18;

function depthPadding(depth: number): string {
  return `${Math.max(0, depth) * INDENT_STEP_PX}px`;
}

/** Clean a node's prose the same way the flat view did (strip control
 *  contracts, collapse structured agent state to a preview). */
function displayProse(text: string | undefined): string {
  if (!text) return '';
  return structuredAgentTextPreview(stripControlContracts(text)).trim();
}

/** A `file_diff` Part recovered from a node observation, if present. */
function observationFileDiff(observation: unknown): FileDiff | undefined {
  const obj = objectValue(observation);
  const candidate =
    obj['type'] === 'file_diff'
      ? obj
      : objectValue(obj['file_diff'])['type'] === 'file_diff'
        ? objectValue(obj['file_diff'])
        : undefined;
  if (!candidate) return undefined;
  if (!stringValue(candidate['path'])) return undefined;
  return candidate as unknown as FileDiff;
}

/** An `image` Part recovered from a node observation, if present. */
function observationImage(observation: unknown): Part | undefined {
  const obj = objectValue(observation);
  const candidate =
    obj['type'] === 'image'
      ? obj
      : objectValue(obj['image'])['type'] === 'image'
        ? objectValue(obj['image'])
        : undefined;
  if (!candidate) return undefined;
  const source = objectValue(candidate['source']);
  if (!stringValue(source['kind'])) return undefined;
  return candidate as unknown as Part;
}

/** A backend-agnostic accent class for an agent: the root/orchestrator gets the
 *  primary accent; every other agent is assigned one of a small palette by a
 *  generic hash of its id. No per-agent-name knowledge. */
function agentClass(agent: string): string {
  const id = (agent || 'main').trim();
  if (id === '' || id === 'main' || id === 'orchestrator') return 'is-main';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `is-agent-${hash % 4}`;
}

function AgentName(props: { agent: string }) {
  const name = () => (props.agent || 'main').trim() || 'main';
  return (
    <span class={`extree__agent ${agentClass(props.agent)}`} data-agent={name()}>
      {name()}
    </span>
  );
}

/** A tool result, collapsed to ~3 lines, expandable via <details>. When the
 *  observation carries a file_diff or image artifact, render it inline in the
 *  expanded area via the existing transcript part views. */
function ObservationBlock(props: {
  toolName: string;
  observation: unknown;
  preview: string;
  onOpenDiff?: (diff: FileDiff) => void;
}) {
  const lines = createMemo(() => props.preview.split('\n'));
  const collapsed = createMemo(() => lines().slice(0, 3));
  const diff = createMemo(() => observationFileDiff(props.observation));
  const image = createMemo(() => observationImage(props.observation));
  const hasArtifact = createMemo(
    () => Boolean(diff() || image()) || carriesArtifact(props.preview),
  );
  const expandable = createMemo(
    () => lines().length > 3 || hasArtifact() || props.preview.length > 200,
  );
  return (
    <details
      class="extree__obs"
      data-testid="execution-tree-observation"
      open={false}
    >
      <summary class="extree__obs-summary">
        <span class="extree__obs-rail" aria-hidden>
          ⎿
        </span>
        <span class="extree__obs-preview">
          <For each={collapsed()}>
            {(line) => <span class="extree__obs-line">{line}</span>}
          </For>
        </span>
        <Show when={expandable()}>
          <span class="extree__obs-toggle" data-testid="execution-tree-observation-toggle">
            <Icon name="chevron-down" size={11} />
            <span class="extree__obs-toggle-label">expand</span>
          </span>
        </Show>
      </summary>
      <div class="extree__obs-full">
        <For each={lines()}>
          {(line) => <div class="extree__obs-line">{line}</div>}
        </For>
        <Show when={diff()}>
          {(d) => <FileDiffPartView part={d()} onOpenDiff={props.onOpenDiff} />}
        </Show>
        <Show when={image()}>{(img) => <ImagePartView part={img()} />}</Show>
      </div>
    </details>
  );
}

function ExecutionTreeNode(props: {
  node: ProjectedExecutionNode;
  onOpenDiff?: (diff: FileDiff) => void;
}) {
  const node = () => props.node;
  const pad = createMemo(() => depthPadding(node().depth));
  const contentPad = createMemo(() => depthPadding(node().depth + 1));

  return (
    <div
      class={`extree__node extree__node--${node().kind}`}
      data-testid="execution-tree-node"
      data-kind={node().kind}
      data-depth={node().depth}
      data-agent={(node().agent || 'main').trim() || 'main'}
    >
      <Show when={node().kind === 'text'}>
        <div class="extree__row" style={{ 'padding-left': pad() }}>
          <AgentName agent={node().agent} />
          <Show when={displayProse(node().text)}>
            <div class="extree__prose" style={{ 'padding-left': depthPadding(1) }}>
              {displayProse(node().text)}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={node().kind === 'handoff'}>
        <div class="extree__row" style={{ 'padding-left': pad() }}>
          <div class="extree__handoff-head">
            <span class="extree__handoff-arrow" aria-hidden>
              ↳
            </span>
            <AgentName agent={node().parent || 'main'} />
            <span class="extree__handoff-to">→</span>
            <AgentName agent={node().agent} />
          </div>
          <Show when={displayProse(node().question)}>
            <div class="extree__prose" style={{ 'padding-left': depthPadding(1) }}>
              {displayProse(node().question)}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={node().kind === 'step'}>
        <div class="extree__row" style={{ 'padding-left': contentPad() }}>
          <Show when={displayProse(node().reasoning) || displayProse(node().text)}>
            <div class="extree__thought" data-testid="execution-tree-thought">
              {displayProse(node().reasoning) || displayProse(node().text)}
            </div>
          </Show>
          <Show when={node().toolName && !node().isFinish}>
            {(_) => {
              const obs = observationPreview(node().toolName ?? '', node().observation);
              return (
                <div
                  class="extree__tool"
                  data-testid="execution-tree-tool"
                  data-tool={node().toolName}
                >
                  <span class="extree__tool-call" data-testid={`toolcall-${node().toolName}`}>
                    <Icon name="tool" size={11} />
                    <span class="extree__tool-name">
                      {toolDisplayName(node().toolName ?? '')}
                    </span>
                    <Show when={formatArgs(node().toolArgs)}>
                      <span class="extree__tool-args">{formatArgs(node().toolArgs)}</span>
                    </Show>
                  </span>
                  <Show when={obs}>
                    <ObservationBlock
                      toolName={node().toolName ?? ''}
                      observation={node().observation}
                      preview={obs}
                      onOpenDiff={props.onOpenDiff}
                    />
                  </Show>
                </div>
              );
            }}
          </Show>
        </div>
      </Show>

      <Show when={node().kind === 'report'}>
        <div class="extree__row" style={{ 'padding-left': pad() }}>
          <div class="extree__report-head">
            <AgentName agent={node().agent} />
            <span class="extree__report-verb">returned</span>
          </div>
          <Show when={reportPreview(node())}>
            <div class="extree__prose" style={{ 'padding-left': depthPadding(1) }}>
              {reportPreview(node())}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function ExecutionTree(props: {
  nodes: ProjectedExecutionNode[];
  onOpenDiff?: (diff: FileDiff) => void;
}) {
  return (
    <div class="extree" data-testid="execution-tree">
      <For each={props.nodes}>
        {(node) => <ExecutionTreeNode node={node} onOpenDiff={props.onOpenDiff} />}
      </For>
    </div>
  );
}
