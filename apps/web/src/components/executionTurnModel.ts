/**
 * LIVE-PATH UNIFICATION (RENDERING_SPEC §9).
 *
 * Converts the projected multi-agent execution nodes (ProjectedExecutionNode[],
 * built live from the SSE semantic events) into the SAME clean
 * {@link AssistantTurnModel} the persisted-message path uses — so the live,
 * mid-run render goes through {@link AssistantTurnView} (flat, no boxes, depth
 * indentation, content-typed tool output, full model text) instead of the old
 * boxed `ExecutionTree`. Live and post-reload renders become identical.
 *
 * Mapping (backend-agnostic — no tool/expert/workflow vocabulary):
 *   - `text`    node → a ReasoningBlock (main's / an agent's own thoughts), in
 *                      FULL. Clio status scaffolding is stripped.
 *   - `handoff` node → opens a DelegationBlock (parent → agent, depth, task).
 *   - `step`    node → a DelegationToolCall on the agent's block, carrying the
 *                      expert's per-step reasoning (turn delineation) + the REAL
 *                      tool result recovered from `tool.call.completed`. A
 *                      `finish` step with no tool folds its reasoning into the
 *                      block result.
 *   - `report`  node → the block's result (the expert's return to its parent).
 *
 * The tool result is content-typed via the SAME {@link analyzeToolResult} used
 * by the persisted path, so geocode → place line, CSV → table, a *.png → an
 * inline image, etc. — never a generic `N item · M fields` count.
 */
import { analyzeToolResult, type ToolResultAnalysis } from './toolResultPreview.js';
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';
import {
  stripControlContracts,
  structuredAgentTextPreview,
} from './executionProjectionReport.js';
import { reportPreview } from './executionProjectionReport.js';
import { observationPreview } from './executionObservationPreview.js';
import { formatArgs, toolDisplayName } from './executionProjectionPreview.js';
import { isRedacted } from './executionProjectionHelpers.js';
import { stripClioScaffolding } from './clioScaffolding.js';
import type {
  AssistantTurnModel,
  DelegationBlock,
  DelegationToolCall,
  ReasoningBlock,
} from './transcriptDelegationModel.js';

/** Clean a node's prose: drop clio status scaffolding + display-only state. */
function cleanProse(text: string | undefined): string {
  if (!text) return '';
  const stripped = structuredAgentTextPreview(stripControlContracts(stripClioScaffolding(text)));
  return stripped.trim();
}

/** Raw string form of the real tool result, for content-typed analysis. */
function toolResultRaw(node: ProjectedExecutionNode): string {
  // Prefer the REAL, unredacted result recovered from `tool.call.completed`.
  if (node.toolResult && !isRedacted(node.toolResult)) return node.toolResult;
  // Fall back to the (often redacted) react-step observation.
  const obs = node.observation;
  if (obs == null) return '';
  const text = typeof obs === 'string' ? obs : JSON.stringify(obs);
  return isRedacted(text) ? '' : text;
}

/**
 * Build a DelegationToolCall from a `step` node. The result is content-typed via
 * the shared analyzer; when no machine-readable result is available we fall back
 * to the human observation preview as plain text so the row still shows data.
 */
function toolCallFromStep(node: ProjectedExecutionNode, blockId: string, index: number): DelegationToolCall {
  const name = toolDisplayName(node.toolName ?? '') || node.toolName || 'tool';
  const raw = toolResultRaw(node);
  const analysis: ToolResultAnalysis = raw
    ? analyzeToolResult(raw)
    : (() => {
        const preview = observationPreview(node.toolName ?? '', node.observation);
        return {
          content: { kind: 'text' as const, text: preview },
          preview,
          full: preview,
        };
      })();
  const reasoning = cleanProse(node.reasoning) || cleanProse(node.text);
  const argsSummary = stripParens(formatArgs(node.toolArgs));
  return {
    id: `${blockId}-tool-${index}`,
    ...(reasoning ? { reasoning } : {}),
    name,
    argsSummary,
    content: analysis.content,
    preview: analysis.preview,
    result: analysis.full,
    ...(analysis.imagePath ? { imagePath: analysis.imagePath } : {}),
    ok: !node.toolError,
    ...(node.toolDurationMs != null ? { durationMs: node.toolDurationMs } : {}),
  };
}

/** `formatArgs` returns `(a · b)`; the renderer wraps in its own parens. */
function stripParens(s: string): string {
  const t = s.trim();
  return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t;
}

/**
 * Convert projected execution nodes into the clean AssistantTurnModel. Returns
 * null when there is nothing delegated/structured to show (the caller then
 * leaves the message to its normal rendering).
 */
export function buildTurnModelFromNodes(
  nodes: readonly ProjectedExecutionNode[],
): AssistantTurnModel | null {
  if (!nodes.length) return null;

  const reasoning: ReasoningBlock[] = [];
  const blocks: DelegationBlock[] = [];
  // The block currently OPEN for each agent, so steps/reports attach correctly.
  const blockByAgent = new Map<string, DelegationBlock>();
  const toolCounter = new Map<string, number>();
  let sawDelegation = false;

  const ensureBlock = (agent: string, depth: number): DelegationBlock => {
    const existing = blockByAgent.get(agent);
    if (existing) return existing;
    const id = `exec-block-${blocks.length}`;
    const block: DelegationBlock = {
      id,
      agent,
      parent: 'main',
      depth,
      status: 'observed',
      task: '',
      tools: [],
      result: '',
    };
    blocks.push(block);
    blockByAgent.set(agent, block);
    return block;
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const agent = (node.agent || 'main').trim() || 'main';

    if (node.kind === 'text') {
      const prose = cleanProse(node.text);
      if (!prose) continue;
      // The root/orchestrator's own thoughts (and any free-standing agent prose
      // outside a delegation) render as reasoning in the flow, in FULL.
      reasoning.push({ id: `exec-reason-${reasoning.length}`, agent, depth: node.depth, text: prose });
      continue;
    }

    if (node.kind === 'handoff') {
      sawDelegation = true;
      const id = `exec-block-${blocks.length}`;
      const block: DelegationBlock = {
        id,
        agent,
        parent: (node.parent || 'main').trim() || 'main',
        depth: node.depth,
        status: 'observed',
        task: cleanProse(node.question),
        tools: [],
        result: '',
      };
      blocks.push(block);
      blockByAgent.set(agent, block);
      continue;
    }

    if (node.kind === 'step') {
      const block = ensureBlock(agent, node.depth);
      if (node.toolName && !node.isFinish) {
        const idx = (toolCounter.get(block.id) ?? 0) + 1;
        toolCounter.set(block.id, idx);
        block.tools.push(toolCallFromStep(node, block.id, idx));
      } else {
        // A finish/no-tool step: its reasoning is the agent's closing thought.
        const prose = cleanProse(node.reasoning) || cleanProse(node.text);
        if (prose) block.result = block.result ? `${block.result}\n\n${prose}` : prose;
      }
      continue;
    }

    if (node.kind === 'report') {
      sawDelegation = true;
      const block = ensureBlock(agent, node.depth);
      const summary = cleanProse(reportPreview(node));
      if (summary) block.result = block.result ? `${block.result}\n\n${summary}` : summary;
      continue;
    }
  }

  // Drop empty blocks (no task, no tools, no result).
  const liveBlocks = blocks.filter((b) => b.task || b.tools.length > 0 || b.result.trim());

  // Nothing structured to show → defer to the normal renderer.
  if (!sawDelegation && reasoning.length === 0 && liveBlocks.length === 0) return null;

  return {
    ...(reasoning.length ? { reasoning } : {}),
    blocks: liveBlocks,
    answer: '',
    passthrough: [],
  };
}
