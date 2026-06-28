/**
 * BACKEND-AGNOSTIC data-transform for ASSISTANT transcript turns.
 *
 * GACT is a generic client for ANY backend (contract/SPEC.md). An assistant turn
 * is an APPEND-ONLY ORDERED LOG of ROWS, built from the ordered message parts in
 * the exact order they arrived on the wire (`message.part.added`). This mirrors
 * the TUI's execution render and is the SINGLE projection used by BOTH the live
 * (streaming) and the persisted (reloaded) render — so a turn is only ever
 * appended to, never re-grouped or re-ordered (RENDERING_SPEC: a conversation,
 * once written, does not mutate above the cursor).
 *
 * Each row is one atom of the log, in arrival order:
 *   - delegation : `● parent → agent` header (+ the task that was sent)
 *   - text       : an agent's prose, rendered as markdown IN FULL
 *   - reasoning  : an agent's `thinking` step
 *   - tool       : `name(args) · Nms` + the content-typed result (only this collapses)
 *   - routing    : the orchestrator's chosen expert (subtle, kept inline)
 *   - passthrough: any other part (image / diff / …) rendered by its own view
 *
 * Depth (indentation) is computed generically from the delegation graph
 * (child → parent links carried on every `expert_handoff`), NOT from any
 * hardcoded expert-name list. Each row + tool carries a STABLE id (the part id)
 * so Solid's keyed <For> appends/updates in place and never rebuilds the turn.
 */
import type { Part } from '@clio/core';
import { analyzeToolResult } from './toolResultPreview.js';
import type { ToolResultContent } from './toolResultContent.js';
import { stripClioScaffolding } from './clioScaffolding.js';

/** A single tool call row (a tool_call part, joined to its tool_result by id). */
export interface ToolRow {
  kind: 'tool';
  id: string;
  depth: number;
  agent: string;
  /** The model's reasoning for THIS step, carried on the tool_call part (clio
   *  #732): one turn = thought + the tool it chose. Rendered above the call. */
  thought: string;
  name: string;
  argsSummary: string;
  content: ToolResultContent;
  preview: string;
  result: string;
  imagePath?: string;
  ok: boolean;
  durationMs?: number;
}

/** A `parent → agent` delegation header row. */
export interface DelegationRow {
  kind: 'delegation';
  id: string;
  depth: number;
  parent: string;
  agent: string;
  task: string;
  status: string;
}

/** An agent's prose (markdown, in full). */
export interface TextRow {
  kind: 'text';
  id: string;
  depth: number;
  agent: string;
  text: string;
}

/** An agent's `thinking` step (markdown, in full, muted). */
export interface ReasoningRow {
  kind: 'reasoning';
  id: string;
  depth: number;
  agent: string;
  text: string;
}

/** The orchestrator's routing decision (kept inline, subtle). */
export interface RoutingRow {
  kind: 'routing';
  id: string;
  depth: number;
  selected: string;
  source: string;
}

/** A child agent's structured hand-back to its parent. */
export interface ReturnRow {
  kind: 'return';
  id: string;
  depth: number;
  agent: string;
  parent: string;
  text: string;
}

/** Any non-delegation, non-text part rendered by its own per-type view. */
export interface PassthroughRow {
  kind: 'passthrough';
  id: string;
  depth: number;
  part: Part;
}

export type TurnRow =
  | DelegationRow
  | TextRow
  | ReasoningRow
  | ToolRow
  | RoutingRow
  | ReturnRow
  | PassthroughRow;

/** The clean ordered view-model for an assistant turn: a flat append-only log. */
export interface AssistantTurnModel {
  /** Every atom of the turn, in wire-arrival order. */
  rows: TurnRow[];
}

interface PartLike {
  type?: string;
  id?: string;
  text?: string;
  agent_id?: string;
  parent_agent?: string;
  child_agent?: string;
  stage?: string;
  status?: string;
  call_id?: string;
  tool_name?: string;
  thought?: string;
  input?: unknown;
  content?: unknown;
  output?: unknown;
  duration_ms?: number;
  selected_agent?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Clean an agent's prose: drop clio status scaffolding + a leading
 *  `A -> B | status | …` pipe prefix some backends glue onto handoff bodies. */
function cleanProse(raw: string): string {
  return stripStatusPrefix(stripClioScaffolding(raw)).trim();
}

/**
 * Strip a leading pipe-delimited status prefix, e.g.
 * "agent -> agent | completed | <stage> | <prose>". Detected STRUCTURALLY (an
 * "A -> B" arrow head followed by short ` | <token>` segments); format-based,
 * never a match of a specific status word. Never eats a markdown table row.
 */
function stripStatusPrefix(text: string): string {
  const nl = text.indexOf('\n');
  const head = nl >= 0 ? text.slice(0, nl) : text;
  if (!/^\s*\S+\s*->\s*\S+\s*\|/.test(head)) return text;
  const lastPipe = head.lastIndexOf('|');
  if (lastPipe < 0) return text;
  const segments = head.slice(0, lastPipe).split('|');
  if (!segments.every((s) => s.trim().length <= 40)) return text;
  const rest = head.slice(lastPipe + 1).trimStart();
  return nl >= 0 ? rest + text.slice(nl) : rest;
}

/**
 * A handoff `output_summary` is frequently a BARE JSON evidence object (typed
 * structured state — display-only per the contract), not prose. Such a body is
 * machine state, not something to render as the delegation's task line, so it is
 * treated as empty. A summary that is real prose (optionally followed by state,
 * already stripped) is kept verbatim.
 */
function dropBareJsonSummary(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const wrapped =
    (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
  if (wrapped) {
    try {
      JSON.parse(t);
      return '';
    } catch {
      // not valid JSON — fall through and treat as prose
    }
  }
  return text;
}

/** Render a tool's args object/string into a compact one-line summary. */
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
  return clip(parts.join(' · '), 160);
}

function toolRowsFromHandoffMetadata(
  tools: unknown,
  agent: string,
  depth: number,
  baseId: string,
): ToolRow[] {
  if (!Array.isArray(tools)) return [];
  const rows: ToolRow[] = [];
  tools.forEach((tool, idx) => {
    if (!tool || typeof tool !== 'object') return;
    const rec = tool as Record<string, unknown>;
    const resultStr = extractToolResultText(rec['result'] ?? rec['output']);
    const analysis = analyzeToolResult(resultStr);
    const callId = str(rec['call_id']) || str(rec['id']) || String(idx);
    const duration = rec['duration_ms'];
    rows.push({
      kind: 'tool',
      id: `tool-${baseId}-${callId}`,
      depth,
      agent,
      thought: cleanProse(str(rec['thought']) || str(rec['reasoning'])),
      name: str(rec['name']) || str(rec['tool_name']) || 'tool',
      argsSummary: summariseArgs(rec['args'] ?? rec['input']),
      content: analysis.content,
      preview: analysis.preview,
      result: analysis.full,
      ...(analysis.imagePath ? { imagePath: analysis.imagePath } : {}),
      ok: rec['ok'] !== false && rec['is_error'] !== true,
      ...(typeof duration === 'number' ? { durationMs: duration } : {}),
    });
  });
  return rows;
}

/**
 * Extract the human-facing text from a `tool_result`'s content. Backends (clio,
 * and the LLM content-block convention generally) deliver tool output as an
 * ARRAY OF CONTENT BLOCKS — `[{ id, type: 'text', agent_id, text: '<output>' }]`
 * — not a bare string. Serialising that array verbatim dumps the envelope
 * (`id · type · agent_id · text`) into the transcript instead of the output, so
 * unwrap to the block `text` first; analyzeToolResult then content-types the
 * REAL output. Plain strings and non-block payloads pass through unchanged.
 */
function extractToolResultText(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  const blocks = Array.isArray(result) ? result : [result];
  const texts: string[] = [];
  let sawTextBlock = false;
  for (const b of blocks) {
    if (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string') {
      const ty = (b as { type?: unknown }).type;
      if (ty == null || ty === 'text' || ty === 'output_text' || ty === 'tool_result') {
        sawTextBlock = true;
        const t = (b as { text: string }).text;
        if (t.trim()) texts.push(t);
      }
    }
  }
  if (sawTextBlock) return texts.join('\n');
  return rawResultString(result);
}

function rawResultString(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function isHandoff(part: PartLike): boolean {
  return part.type === 'expert_handoff';
}

/** Agent of a part — the emitter. `expert_handoff` headers belong to the CHILD
 *  (the delegated-to agent) so the header indents with the child's work. */
function partAgent(part: PartLike): string {
  if (part.type === 'expert_handoff') {
    return (
      str(part.child_agent) ||
      str(part.metadata?.['delegate_to']) ||
      str(part.metadata?.['agent_id']) ||
      str(part.agent_id) ||
      'main'
    );
  }
  return str(part.agent_id) || str(part.metadata?.['agent_id']) || 'main';
}

/**
 * Build the child → parent delegation graph from every handoff that names a
 * parent and child, then resolve each agent's depth by walking to a root. Used
 * for indentation; generic, no hardcoded agent names. `main`/root = depth 0.
 */
function buildDepthResolver(list: readonly PartLike[]): (agent: string) => number {
  const parentOf = new Map<string, string>();
  for (const part of list) {
    if (part.type !== 'expert_handoff') continue;
    const child =
      str(part.child_agent) ||
      str(part.metadata?.['delegate_to']) ||
      str(part.metadata?.['agent_id']);
    const parent = str(part.parent_agent) || str(part.metadata?.['parent_id']);
    if (child && parent && child !== parent && !parentOf.has(child)) {
      parentOf.set(child, parent);
    }
  }
  const cache = new Map<string, number>();
  return (agent: string): number => {
    if (!agent) return 0;
    const memo = cache.get(agent);
    if (memo != null) return memo;
    let depth = 0;
    let cur: string | undefined = agent;
    const seen = new Set<string>();
    while (cur && parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur);
      depth++;
    }
    cache.set(agent, depth);
    return depth;
  };
}

/**
 * Project an assistant message's parts into the ordered append-only row log.
 * Returns null for turns with no delegation/agent structure (the caller then
 * leaves the message to its normal flat rendering).
 */
export function buildAssistantTurnModel(parts: readonly Part[]): AssistantTurnModel | null {
  const list = parts as readonly PartLike[];
  if (!list.some(isHandoff)) return null;

  const depthOf = buildDepthResolver(list);
  const rows: TurnRow[] = [];
  // Tool rows indexed by call_id so a later tool_result joins its tool_call.
  const toolByCall = new Map<string, ToolRow>();
  // Dedup delegation headers: a backend emits started + completed + resumed for
  // the same (parent → child); we keep ONE header (the first seen).
  const seenDelegation = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part) continue;
    const type = part.type ?? '';
    const agent = partAgent(part);
    const depth = depthOf(agent);
    const id = str(part.id) || `row-${i}`;

    if (type === 'routing_decision') {
      // Low-level tool-owner routing (`selected geo for tool geo_geocode`,
      // source live_tool_observer) is plumbing, not the orchestrator's decision —
      // the real decision is the expert_handoff (with its thought + task). The
      // canonical render suppresses these chips (RENDERING_SPEC ★ / §9.2). Drop.
      continue;
    }

    if (type === 'expert_handoff') {
      const parent = str(part.parent_agent) || str(part.metadata?.['parent_id']) || 'main';
      const stage = str(part.stage) || str(part.metadata?.['stage']);
      // `agent` is the RESOLVED child (top-level child_agent on the clean stream,
      // or metadata.agent_id on older/metadata-shaped backends — see partAgent).
      // Skip the structural RETURN twin (parent.resumed) and any handoff that
      // doesn't actually name a distinct child (no delegation to show).
      if (stage === 'parent.resumed' || !agent || agent === parent) continue;
      const key = `${parent}->${agent}`;
      if (stage === 'delegate.completed' || stage === 'completed') {
        if (!seenDelegation.has(key)) {
          seenDelegation.add(key);
          rows.push({
            kind: 'delegation',
            id: `delegation-${id}`,
            depth: depthOf(parent),
            parent,
            agent,
            task:
              cleanProse(str(part.metadata?.['question'])) ||
              cleanProse(str(part.metadata?.['input'])) ||
              dropBareJsonSummary(cleanProse(str(part.metadata?.['output_summary']))),
            status: str(part.status) || str(part.metadata?.['status']) || 'completed',
          });
        }
        rows.push(...toolRowsFromHandoffMetadata(part.metadata?.['tools_called'], agent, depth, id));
        rows.push({
          kind: 'return',
          id: `return-${id}`,
          depth: depthOf(agent),
          agent,
          parent,
          text: dropBareJsonSummary(cleanProse(str(part.metadata?.['output_summary']))),
        });
        continue;
      }
      if (seenDelegation.has(key)) continue;
      seenDelegation.add(key);
      rows.push({
        kind: 'delegation',
        // The delegation is the PARENT's turn (its decision to hand off), so it
        // renders at the parent's depth; the child's own work then indents one
        // level deeper (RENDERING_SPEC ★: child indents ONE level below the
        // delegating turn). Was depthOf(child), which over-indented the header.
        id,
        depth: depthOf(parent),
        parent,
        agent,
        // The delegated task: the question sent down, else a backend-provided
        // handoff summary (older shape). cleanProse strips clio scaffolding
        // (durable workflow_state JSON) + a leading `A -> B | status` prefix.
        task:
          cleanProse(str(part.metadata?.['question'])) ||
          dropBareJsonSummary(cleanProse(str(part.metadata?.['output_summary']))),
        status: str(part.status) || str(part.metadata?.['status']) || 'observed',
      });
      continue;
    }

    if (type === 'text') {
      const text = cleanProse(str(part.text));
      if (!text) continue;
      rows.push({ kind: 'text', id, depth, agent, text });
      continue;
    }

    if (type === 'thinking') {
      const text = cleanProse(str(part.text));
      if (!text) continue;
      rows.push({ kind: 'reasoning', id, depth, agent, text });
      continue;
    }

    if (type === 'tool_call') {
      const callId = str(part.call_id) || id;
      const row: ToolRow = {
        kind: 'tool',
        id: `tool-${callId}`,
        depth,
        agent,
        thought: cleanProse(str(part.thought) || str(part.metadata?.['thought'])),
        name: str(part.tool_name) || 'tool',
        argsSummary: summariseArgs(part.input ?? part.metadata?.['input']),
        content: { kind: 'text', text: '' },
        preview: '',
        result: '',
        ok: true,
      };
      toolByCall.set(callId, row);
      rows.push(row);
      continue;
    }

    if (type === 'tool_result') {
      const callId = str(part.call_id) || id;
      const resultStr = extractToolResultText(
        part.content ?? part.output ?? part.metadata?.['content'] ?? part.metadata?.['output'],
      );
      const analysis = analyzeToolResult(resultStr);
      const existing = toolByCall.get(callId);
      const durationMs =
        typeof part.duration_ms === 'number' ? part.duration_ms : undefined;
      const ok = part.status !== 'error' && part.metadata?.['is_error'] !== true;
      if (existing) {
        existing.content = analysis.content;
        existing.preview = analysis.preview;
        existing.result = analysis.full;
        if (analysis.imagePath) existing.imagePath = analysis.imagePath;
        existing.ok = ok;
        if (durationMs != null) existing.durationMs = durationMs;
      } else {
        // Orphan result (no preceding call) — still render it as a tool row.
        rows.push({
          kind: 'tool',
          id: `tool-${callId}`,
          depth,
          agent,
          thought: '',
          name: str(part.tool_name) || 'tool',
          argsSummary: '',
          content: analysis.content,
          preview: analysis.preview,
          result: analysis.full,
          ...(analysis.imagePath ? { imagePath: analysis.imagePath } : {}),
          ok,
          ...(durationMs != null ? { durationMs } : {}),
        });
      }
      continue;
    }

    // Everything else (image / file_diff / document / …) is a passthrough row,
    // rendered in place by its own per-type view.
    rows.push({ kind: 'passthrough', id, depth, part: part as Part });
  }

  if (rows.length === 0) return null;
  return { rows: dedupeRepeatedText(rows) };
}

/**
 * Defensive net for clio #736: after a terminal child returns, the orchestrator
 * (`main`) re-emits that child's answer VERBATIM as its own `text` part, so the
 * final brief would render twice. Drop a `text` row whose body exactly repeats
 * an earlier `text` row's body — the answer renders once, attributed to the
 * agent that authored it first. The backend fix removes the duplicate at source;
 * this keeps the render correct regardless. Only EXACT full-body repeats are
 * dropped, so distinct orchestrator summaries (unique prose) are untouched.
 */
function dedupeRepeatedText(rows: TurnRow[]): TurnRow[] {
  const seen = new Set<string>();
  const priorLongChildTexts: string[] = [];
  return rows.filter((r) => {
    if (r.kind !== 'text') return true;
    const body = r.text.trim();
    if (!body) return true;
    if (seen.has(body)) return false;
    if (r.agent === 'main' && isNearDuplicateChildAnswer(body, priorLongChildTexts)) {
      return false;
    }
    seen.add(body);
    if (r.agent !== 'main' && body.length >= 500) priorLongChildTexts.push(body);
    return true;
  });
}

function isNearDuplicateChildAnswer(body: string, priorChildBodies: readonly string[]): boolean {
  if (body.length < 500 || priorChildBodies.length === 0) return false;
  const bodyTokens = normalizedAnswerTokens(body);
  if (bodyTokens.size < 40) return false;
  for (const prior of priorChildBodies) {
    const priorTokens = normalizedAnswerTokens(prior);
    if (priorTokens.size < 40) continue;
    let intersection = 0;
    for (const token of bodyTokens) {
      if (priorTokens.has(token)) intersection += 1;
    }
    const smaller = Math.min(bodyTokens.size, priorTokens.size);
    if (intersection / smaller >= 0.82) return true;
  }
  return false;
}

function normalizedAnswerTokens(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[a-z]:\\[^\s)`]+/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^a-z0-9_]+/g, ' ');
  const stop = new Set([
    'and',
    'are',
    'but',
    'for',
    'from',
    'not',
    'the',
    'this',
    'that',
    'with',
  ]);
  return new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stop.has(token)),
  );
}
