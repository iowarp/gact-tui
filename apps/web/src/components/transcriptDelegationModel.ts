/**
 * Pure data-transform for ASSISTANT transcript turns. Mirrors the TUI's
 * readability semantics but models the assistant's work as a CHAT OF TURNS: an
 * ordered list of clearly-separated delegation BLOCKS (one per expert
 * invocation), each exposing its own explicit, ordered structure:
 *
 *   main → <expert>          delegation header
 *   task                     the task main actually sent (handoff meta.question)
 *   tool call(s) + result(s) each tool the expert ran, in order (meta.tools_called)
 *   <expert> result          the expert's prose/result, rendered as markdown
 *   (return)                 folded into the result — the parent.resumed handoff
 *                            is a verbatim duplicate and is DEDUPED away
 *
 * Three transforms, identical in spirit to the TUI (see
 * tui/internal/ui/execution_supplements.go and semantic_text_summaries.go):
 *
 *  1. DEDUPE — clio emits each delegation TWICE: a `delegate.completed` handoff
 *     (meta.delegate_to set) immediately followed by a `parent.resumed` handoff
 *     (meta.stage === 'parent.resumed') whose body is a verbatim duplicate of
 *     the return. We keep ONE block per delegation and drop the resumed twin.
 *
 *  2. STRIP — handoff text carries control scaffolding ("Retained typed
 *     workflow state: {…}", "CLIO durable typed workflow state:", a leading
 *     "main -> data | completed | delegate.completed | " status prefix, and a
 *     trailing JSON state blob). We strip all of it and keep the real prose
 *     (mirrors stripSemanticControlContracts).
 *
 *  3. DEPTH — delegation depth from agent metadata so the named experts sit at
 *     depth 1 under `main`, nested children deeper (mirrors depthForAgent).
 *
 * The output is an append-only list of blocks the renderer lays out as a flowing
 * transcript. Each block + each tool carries a STABLE id so Solid's <For> only
 * re-renders the block that actually changed during streaming.
 */
import type { Part } from '@clio/core';
import { reportPreview, retainedWorkflowStateFromText } from './executionProjectionReport.js';
import { summarizeHandoffDetail } from './WorkflowStateModel.js';

/** Control-contract markers that prefix a trailing JSON state blob. Mirrors
 *  the marker list in stripSemanticControlContracts / the TUI report stripper. */
const CONTROL_MARKERS = [
  'CLIO durable typed workflow state:',
  'CLIO merged nested typed workflow state:',
  'CLIO typed workflow state:',
  'Retained typed workflow state:',
  'The workflow state is populated accordingly:',
  'The workflow state now records',
  'NEXT_EXPERT:',
  'NEXT_ACTION:',
  'BLOCKER:',
  'DO_NOT_DELEGATE',
  'DO_NOT_FINALIZE',
  'continuation_contract=',
] as const;

/** A single tool the expert ran during its turn (from meta.tools_called). */
export interface DelegationToolCall {
  /** Stable key for keyed rendering. */
  id: string;
  /** Tool name (e.g. geo_geocode, ndp_stage_resource). */
  name: string;
  /** Compact one-line argument summary for the "⚙ name(args)" line. */
  argsSummary: string;
  /** The raw result body, rendered as a compacted "⎿ result" block. */
  result: string;
  /** Whether the call succeeded. */
  ok: boolean;
  /** Wall-clock duration in ms, when reported. */
  durationMs?: number;
  /** Whether the result was served from cache. */
  cached?: boolean;
}

/** A single delegation BLOCK in the assistant turn — one expert invocation. */
export interface DelegationBlock {
  /** Stable key for keyed rendering (handoff part id, or a synthesised fallback). */
  id: string;
  /** Owning expert label (geospatial / data / analysis / …). */
  agent: string;
  /** Parent agent that issued the delegation (usually `main`). */
  parent: string;
  /** Delegation depth — 0 = main, 1 = named expert, 2+ = nested child. */
  depth: number;
  /** Lifecycle status (completed / failed / running / observed …). */
  status: string;
  /** The task main actually SENT to this expert (handoff meta.question). */
  task: string;
  /** The tool calls this expert ran, in order. */
  tools: DelegationToolCall[];
  /** The expert's cleaned prose/result, rendered as markdown. Never scaffolding. */
  result: string;
}

/** The clean ordered view-model for an assistant turn. */
export interface AssistantTurnModel {
  /** Optional routing chip (kept OUT of the main flow). */
  routing?: {
    selected: string;
    rationale: string;
    source: string;
  };
  /** The delegation blocks, in order, deduped + stripped + depth-tagged. */
  blocks: DelegationBlock[];
  /** The final answer text part(s), rendered prominently as markdown. */
  answer: string;
  /** Non-delegation, non-text parts (tool_call/tool_result/file_diff/image/…)
   *  passed through to the normal per-type renderers but laid out in flow. */
  passthrough: Part[];
}

interface PartLike {
  type?: string;
  id?: string;
  text?: string;
  metadata?: Record<string, unknown>;
  selected_agent?: string;
  rationale?: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Strip clio's control scaffolding from a handoff/text body, keeping the real
 * prose. Removes (a) the leading "agent -> agent | status | stage | " status
 * prefix the wire glues on, and (b) everything from the first control marker
 * onward (which is always followed by a JSON state blob). Mirrors
 * stripSemanticControlContracts (TUI).
 */
export function stripControlScaffolding(raw: string): string {
  let text = (raw ?? '').trim();
  if (!text) return '';
  text = stripStatusPrefix(text);
  // Cut at the earliest control marker (case-insensitive); the marker and its
  // trailing JSON blob are scaffolding, not prose.
  const upper = text.toUpperCase();
  let cut = -1;
  for (const marker of CONTROL_MARKERS) {
    const idx = upper.indexOf(marker.toUpperCase());
    if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
  }
  if (cut >= 0) text = text.slice(0, cut);
  return text.trim();
}

/**
 * Remove a leading "main -> data | completed | delegate.completed | " (or
 * "main | completed | parent.resumed | ") status prefix. The prefix is a
 * pipe-delimited run of short status tokens ending in a stage like
 * `delegate.completed` / `parent.resumed`, followed by " | " then the prose.
 */
function stripStatusPrefix(text: string): string {
  // Only consider a prefix on the first line and only up to the LAST pipe that
  // precedes a stage token, so we never eat pipes inside a markdown table.
  const firstNl = text.indexOf('\n');
  const head = firstNl >= 0 ? text.slice(0, firstNl) : text;
  const stageRe = /\b(delegate\.completed|delegate\.started|parent\.resumed)\b/;
  const m = stageRe.exec(head);
  if (!m) return text;
  // Find the " | " separator that immediately follows the stage token.
  const after = head.slice(m.index + m[0].length);
  const sepIdx = after.indexOf('|');
  if (sepIdx < 0) {
    // Stage is the last token on the head line; prose begins next line.
    return firstNl >= 0 ? text.slice(firstNl + 1).trimStart() : '';
  }
  const consumed = m.index + m[0].length + sepIdx + 1;
  const rest = firstNl >= 0 ? head.slice(consumed) + text.slice(firstNl) : head.slice(consumed);
  return rest.trimStart();
}

/** Depth of a named agent. Mirrors timelineAgentDepth (TUI). */
function agentDepth(agent: string): number {
  const a = agent.trim();
  if (a === '' || a === 'main') return 0;
  if (['data', 'geospatial', 'analysis', 'visualization', 'synthesis'].includes(a)) return 1;
  return 2;
}

/**
 * Depth from full metadata: prefer the parent relationship, fall back to the
 * agent's own known depth. Mirrors depthForAgent (TUI).
 */
function depthFor(agent: string, parent: string): number {
  const a = agent.trim();
  const p = parent.trim();
  if (p === '' || p === 'main') {
    if (a === 'main' || a === '') return 0;
    return 1;
  }
  return agentDepth(p) + 1;
}

/**
 * Derive a structured evidence summary from a handoff whose text is pure
 * workflow-state scaffolding (no prose). Mirrors the TUI's reportPreview over
 * the retained typed state. Returns '' when no structured state is present.
 */
function structuredHandoffSummary(raw: string, agent: string): string {
  const state = retainedWorkflowStateFromText(raw);
  if (!state || Object.keys(state).length === 0) return '';
  const preview = reportPreview({
    kind: 'report',
    agent,
    depth: 1,
    structured: state,
    text: raw,
  }).trim();
  return stripStatusPrefix(preview);
}

/**
 * Produce the displayable prose for a handoff: strip scaffolding, then
 * summarise any bare leading JSON evidence object, and finally fall back to a
 * structured workflow-state summary when no prose remains. A markdown ```json
 * fenced block is left intact (it renders as a readable code block).
 */
function cleanHandoffText(raw: string, agent: string): string {
  const stripped = stripControlScaffolding(raw);
  if (!stripped) return structuredHandoffSummary(raw, agent);
  // A bare leading "{ … }" evidence object (NOT a fenced ```json block) gets
  // summarised into "key: value" prose rather than dumped verbatim (mirrors the
  // TUI's summarizeHandoffDetail).
  if (stripped.startsWith('{')) {
    const summary = summarizeHandoffDetail(stripped).trim();
    if (summary) return summary;
  }
  return stripped;
}

/** Normalised text used for the dedupe comparison (mirrors
 *  normalizeExecutionComparable: strip scaffolding, collapse whitespace,
 *  lowercase). Falls back to the normalised retained-state JSON when the prose
 *  is empty, so pure-scaffolding handoffs still dedupe against their duplicate. */
function comparable(text: string): string {
  const prose = stripControlScaffolding(text).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  if (prose) return prose;
  const state = retainedWorkflowStateFromText(text);
  if (state && Object.keys(state).length) {
    return JSON.stringify(state).toLowerCase().replace(/\s+/g, '');
  }
  return '';
}

function isHandoff(part: PartLike): boolean {
  return part.type === 'expert_handoff';
}

function isParentResumed(part: PartLike): boolean {
  return str(part.metadata?.['stage']) === 'parent.resumed';
}

/** Render a tool's args object/string into a compact one-line summary for the
 *  "⚙ name(args)" header line — long values are truncated. */
function summariseArgs(args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return clip(args, 120);
  if (typeof args !== 'object') return clip(String(args), 120);
  const entries = Object.entries(args as Record<string, unknown>);
  const parts = entries.map(([k, v]) => {
    let val: string;
    if (typeof v === 'string') val = v;
    else if (v == null) val = 'null';
    else val = JSON.stringify(v);
    return `${k}: ${clip(val, 60)}`;
  });
  return clip(parts.join(', '), 160);
}

/** Render a tool's result (object or string) into displayable text. */
function resultText(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Extract the ordered tool calls a handoff recorded in meta.tools_called. */
function extractTools(meta: Record<string, unknown>, blockId: string): DelegationToolCall[] {
  const raw = meta['tools_called'];
  if (!Array.isArray(raw)) return [];
  const out: DelegationToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    const name = str(rec['name']) || str(rec['tool_name']) || 'tool';
    out.push({
      id: str(rec['call_id']) || `${blockId}-tool-${i}`,
      name,
      argsSummary: summariseArgs(rec['args'] ?? rec['input']),
      result: resultText(rec['result'] ?? rec['output'] ?? rec['content']),
      ok: rec['ok'] !== false && rec['is_error'] !== true,
      ...(typeof rec['duration_ms'] === 'number' ? { durationMs: rec['duration_ms'] } : {}),
      ...(typeof rec['cached'] === 'boolean' ? { cached: rec['cached'] } : {}),
    });
  }
  return out;
}

/**
 * Identity-stabilise a freshly-built turn model against the previous one so that
 * Solid's reference-keyed <For> only re-renders the block that actually changed.
 *
 * `buildAssistantTurnModel` is pure and returns brand-new objects on every SSE
 * delta. Without this, <For each={blocks}> would tear down and rebuild EVERY
 * block component per token — discarding each block's memoized markdown and
 * forcing a full re-parse + re-layout of the whole transcript (the lag the
 * owner reported). Here we reuse the previous block object (same reference) when
 * its content is byte-for-byte identical, so unchanged blocks keep their DOM and
 * their MemoMarkdown caches; only the streaming block (whose result/tools grew)
 * gets a new reference and re-renders.
 */
export function reconcileTurnModel(
  prev: AssistantTurnModel | null,
  next: AssistantTurnModel,
): AssistantTurnModel {
  if (!prev) return next;
  const prevById = new Map(prev.blocks.map((b) => [b.id, b]));
  const blocks = next.blocks.map((block) => {
    const old = prevById.get(block.id);
    if (old && blockEquals(old, block)) return old;
    if (old) return reconcileBlock(old, block);
    return block;
  });
  return { ...next, blocks };
}

/** Reuse the prior block reference's unchanged tool objects so a streaming
 *  block only re-renders the tool whose result grew. */
function reconcileBlock(old: DelegationBlock, next: DelegationBlock): DelegationBlock {
  const prevTools = new Map(old.tools.map((t) => [t.id, t]));
  const tools = next.tools.map((tool) => {
    const ot = prevTools.get(tool.id);
    return ot && toolEquals(ot, tool) ? ot : tool;
  });
  return { ...next, tools };
}

function blockEquals(a: DelegationBlock, b: DelegationBlock): boolean {
  return (
    a.agent === b.agent &&
    a.parent === b.parent &&
    a.depth === b.depth &&
    a.status === b.status &&
    a.task === b.task &&
    a.result === b.result &&
    a.tools.length === b.tools.length &&
    a.tools.every((t, i) => toolEquals(t, b.tools[i]!))
  );
}

function toolEquals(a: DelegationToolCall, b: DelegationToolCall): boolean {
  return (
    a.name === b.name &&
    a.argsSummary === b.argsSummary &&
    a.result === b.result &&
    a.ok === b.ok &&
    a.durationMs === b.durationMs &&
    a.cached === b.cached
  );
}

/**
 * Project an assistant message's parts into the clean ordered turn model — a
 * chat of delegation blocks plus the final answer.
 *
 * Returns null for non-assistant messages or turns that carry no delegation /
 * handoff structure (those keep the simple flat rendering).
 */
export function buildAssistantTurnModel(parts: readonly Part[]): AssistantTurnModel | null {
  const list = parts as readonly PartLike[];
  if (!list.some(isHandoff)) return null;

  const blocks: DelegationBlock[] = [];
  const passthrough: Part[] = [];
  let routing: AssistantTurnModel['routing'] | undefined;
  const answerChunks: string[] = [];
  let prevHandoffKey = '';

  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part) continue;
    const type = part.type ?? '';

    if (type === 'routing_decision') {
      const selected = str(part.selected_agent) || 'main';
      const rationale = str(part.rationale) || str((part.metadata ?? {})['route_reason']);
      const source = str((part.metadata ?? {})['route_source']);
      // Keep routing OUT of the main flow as a subtle chip; skip pure
      // scaffolding-removal notes.
      if (!/removed retained evidence scaffolding/i.test(rationale)) {
        routing = { selected, rationale, source };
      }
      continue;
    }

    if (type === 'expert_handoff') {
      const meta = part.metadata ?? {};
      const raw = (part.text ?? '').trim() || str(meta['output_summary']) || str(meta['summary']);
      const key = comparable(raw);

      // DEDUPE: a parent.resumed handoff is a verbatim duplicate of the
      // delegation's return — fold it into the already-emitted block instead of
      // rendering a confusing second unlabeled `geospatial` row. We never start
      // a new block from a parent.resumed.
      if (isParentResumed(part)) {
        prevHandoffKey = key;
        continue;
      }
      prevHandoffKey = key;

      const agent =
        str(meta['delegate_to']) || str(meta['agent_id']) || str(meta['expert']) || 'expert';
      const id = str(part.id) || `block-${i}`;
      // The task main actually SENT to the expert (surfaced from handoff meta).
      const task = str(meta['question']);
      // The expert's result prose, scaffolding removed, rendered as markdown.
      const result = cleanHandoffText(raw, agent);
      const tools = extractTools(meta, id);

      // Skip an utterly empty delegation (no task, no result, no tools).
      if (!task && !result.trim() && tools.length === 0) continue;

      const parent = str(meta['parent_id']) || str(meta['parent']) || 'main';
      const status = str(meta['status']) || 'observed';
      blocks.push({
        id,
        agent,
        parent,
        depth: depthFor(agent, parent),
        status,
        task,
        tools,
        result,
      });
      continue;
    }

    if (type === 'text') {
      const cleaned = stripControlScaffolding(part.text ?? '');
      if (cleaned) answerChunks.push(cleaned);
      continue;
    }

    // Everything else (tool_call/tool_result/file_diff/image/…) flows through
    // the existing per-type renderers, but inside the flowing layout.
    passthrough.push(part as Part);
  }
  void prevHandoffKey;

  return {
    ...(routing ? { routing } : {}),
    blocks,
    answer: answerChunks.join('\n\n'),
    passthrough,
  };
}
