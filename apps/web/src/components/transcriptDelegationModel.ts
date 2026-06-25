/**
 * BACKEND-AGNOSTIC data-transform for ASSISTANT transcript turns.
 *
 * GACT is a generic client for ANY backend (contract/SPEC.md). This module
 * models an assistant turn as a CHAT OF TURNS — an ordered list of delegation
 * BLOCKS (one per expert invocation) — built ENTIRELY from the GENERIC contract
 * + metadata fields, never from any backend's vocabulary:
 *
 *   parent → agent           delegation header   (metadata.parent_id / agent_id)
 *   task                     the task sent       (metadata.question)
 *   tool call(s) + result(s) each tool the expert ran (metadata.tools_called)
 *   agent result             the expert's prose  (metadata.output_summary / text)
 *
 * Three generic transforms:
 *
 *  1. DEDUPE — a backend may emit a delegation's RETURN twice (the structural
 *     "parent resumed" twin). We detect that STRUCTURALLY via metadata
 *     (`metadata.stage === 'parent.resumed'`, a generic lifecycle marker the
 *     contract carries) and via content equality — NOT by string-matching prose.
 *
 *  2. DEPTH — visual delegation depth from `metadata.depth` when it varies, else
 *     computed generically by walking the `parent_id` chain. No hardcoded
 *     expert-name list.
 *
 *  3. RESULT TEXT — render the expert's prose in FULL. metadata.workflow_state /
 *     local_workflow_state are DISPLAY-ONLY (the contract: clients "never rely on
 *     specific keys") so we never render them as prose. When a result body is a
 *     bare JSON state blob (structurally — starts with `{`/`[`), it is treated as
 *     display-only structured detail, not as model prose.
 *
 * Each block + each tool carries a STABLE id so Solid's <For> only re-renders the
 * block that actually changed during streaming.
 */
import type { Part } from '@clio/core';
import { findBalancedJsonEnd } from '../presentationUtils.js';
import { analyzeToolResult } from './toolResultPreview.js';
import type { ToolResultContent } from './toolResultContent.js';

/** A single tool the expert ran during its turn (from meta.tools_called). */
export interface DelegationToolCall {
  /** Stable key for keyed rendering. */
  id: string;
  /** Tool name (rendered verbatim — the renderer never special-cases it). */
  name: string;
  /** Compact one-line argument summary for the "name(args)" line. */
  argsSummary: string;
  /** The DETECTED content type of the result (image / diff / table / …). */
  content: ToolResultContent;
  /** Short collapsed preview line for the result. */
  preview: string;
  /** The full, pretty-printed raw result body, for the expand affordance. */
  result: string;
  /** When the result is an image artifact, its workspace path (inline render). */
  imagePath?: string;
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
  /** Owning agent label. */
  agent: string;
  /** Parent agent that issued the delegation. */
  parent: string;
  /** Visual delegation depth — 0 = top agent, deeper = nested child. */
  depth: number;
  /** Lifecycle status (completed / failed / running / observed …). */
  status: string;
  /** The task that was SENT to this expert (metadata.question). */
  task: string;
  /** The tool calls this expert ran, in order. */
  tools: DelegationToolCall[];
  /** The expert's prose/result, rendered as markdown in FULL. Empty when the
   *  body was only display-only structured state. */
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
  /** The delegation blocks, in order, deduped + depth-tagged. */
  blocks: DelegationBlock[];
  /** The final answer text part(s), rendered prominently as markdown. */
  answer: string;
  /** Non-delegation, non-text parts (tool_call/tool_result/file_diff/image/…). */
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
 * Produce the displayable prose for a handoff. The expert's prose lives in
 * `metadata.output_summary` (or the part text). We render it IN FULL — no clio
 * marker stripping. The only generic transform: when the body is a bare JSON
 * state blob (display-only structured state per the contract), it is NOT model
 * prose, so we return `{ text: '', structural: true }` and let the caller decide
 * whether to show it as structured detail or suppress it.
 *
 * A body of the shape `Some Label:\n{ …json… }` is also treated as structural —
 * the leading label + JSON is display-only state, detected by STRUCTURE (a short
 * caption line immediately followed by a JSON object), not by matching any
 * specific marker text.
 */
function handoffResultText(raw: string): { text: string; structural: boolean } {
  let text = stripInjectedNoise(raw.trim());
  if (!text) return { text: '', structural: false };
  // Bare JSON object/array → display-only structured state, not prose.
  if (/^[[{]/.test(text)) return { text: '', structural: true };
  // "<short caption line>:" immediately followed by a JSON object → the caption
  // labels a display-only state blob. Treat the whole thing as structural.
  const labelled = /^([^\n{}]{0,80}:)\s*\n?\s*[[{]/.exec(text);
  if (labelled) return { text: '', structural: true };
  // Strip any display-only state blobs: a short caption line (`<caption>:`)
  // immediately followed by a balanced JSON object, ANYWHERE in the body — plus a
  // trailing caption line left with no JSON. Detected STRUCTURALLY, never by
  // matching a backend marker (RENDERING_SPEC §5).
  text = stripStructuralBlobs(text);
  return { text: text.trim(), structural: false };
}

/** Caption line = a short, brace-free line ending in a colon. */
const CAPTION_LINE = /^[^\n{}]{0,80}:$/;

/**
 * Remove display-only structured-state blobs from a prose body. A blob is a
 * caption line (`<caption>:`) immediately followed by a balanced JSON object;
 * stacked captions before the JSON ("A:\n\nB:\n{…}") are absorbed. Also drops a
 * trailing caption-only line. Iterates to catch multiple blobs. Structural only.
 */
function stripStructuralBlobs(text: string): string {
  let out = text;
  for (let guard = 0; guard < 12; guard++) {
    const m = /(^|\n)([^\n{}]{0,80}:)[ \t]*\n?[ \t]*\{/.exec(out);
    if (!m) break;
    const braceIdx = out.indexOf('{', m.index);
    if (braceIdx < 0) break;
    const end = findBalancedJsonEnd(out, braceIdx);
    if (end < 0) break;
    // Start of the caption that introduces this JSON.
    let cut = m.index + (m[1] ? m[1].length : 0);
    // Absorb immediately-preceding caption-only / blank lines (stacked markers).
    const before = out.slice(0, cut).split('\n');
    while (before.length) {
      const last = before[before.length - 1]!.trim();
      if (last === '' || CAPTION_LINE.test(last)) {
        before.pop();
        cut = before.join('\n').length + (before.length ? 1 : 0);
      } else break;
    }
    out = (out.slice(0, cut).trimEnd() + '\n\n' + out.slice(end + 1).trimStart()).trim();
  }
  // Drop a trailing caption-only line (a marker left without its JSON).
  const lines = out.split('\n');
  while (lines.length) {
    const last = lines[lines.length - 1]!.trim();
    if (last === '' || CAPTION_LINE.test(last)) lines.pop();
    else break;
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Remove obvious INJECTED-STATUS noise from a prose body (RENDERING_SPEC §5).
 * This is FORMAT-based cleanup — a line that is wholly a bracketed `[…]` status
 * / index marker, or a standalone `(In progress…)` / `(awaiting…)` parenthetical
 * placeholder — NOT matching of any backend's protocol vocabulary. Everything
 * from a trailing `[…evidence index]`-style bracketed block to the end is also
 * dropped (it is machine bookkeeping the model leaves inline).
 */
function stripInjectedNoise(text: string): string {
  if (!text) return '';
  text = stripStatusPrefix(text);
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // A line that is entirely a single bracketed marker, e.g. "[ … ]".
    if (/^\[[^\]]*\]$/.test(t)) continue;
    // A standalone parenthetical in-progress/awaiting status placeholder.
    if (/^\(?\s*(in progress|awaiting)\b[^)]*\)?$/i.test(t)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Strip a leading pipe-delimited status prefix that a backend may glue onto a
 * handoff body, e.g. "agent -> agent | completed | <stage> | <prose>". Detected
 * STRUCTURALLY: the first line starts with "<token> -> <token>" followed by a run
 * of short ` | <token>` segments; we drop up to the last pipe and keep the prose.
 * Format-based, not a match of any specific status word. Never eats pipes inside
 * a markdown table (those rows don't start with "<token> -> <token>").
 */
function stripStatusPrefix(text: string): string {
  const nl = text.indexOf('\n');
  const head = nl >= 0 ? text.slice(0, nl) : text;
  // Require an "A -> B" arrow head followed by at least one " | " segment.
  if (!/^\s*\S+\s*->\s*\S+\s*\|/.test(head)) return text;
  const lastPipe = head.lastIndexOf('|');
  if (lastPipe < 0) return text;
  // Only strip when every segment before the last pipe is short (a status token),
  // so we never eat a real sentence that happens to contain a pipe.
  const segments = head.slice(0, lastPipe).split('|');
  if (!segments.every((s) => s.trim().length <= 40)) return text;
  const rest = head.slice(lastPipe + 1).trimStart();
  return nl >= 0 ? rest + text.slice(nl) : rest;
}

function isHandoff(part: PartLike): boolean {
  return part.type === 'expert_handoff';
}

/** A structural lifecycle marker the contract carries on a delegation's RETURN
 *  twin. Detected via the generic `stage` metadata field, never via prose. */
function isParentResumed(part: PartLike): boolean {
  return str(part.metadata?.['stage']) === 'parent.resumed';
}

/**
 * Visual delegation depth, generic. Prefer `metadata.depth` when the turn's
 * depths vary (the backend is telling us the nesting). Otherwise compute depth
 * by walking the `parent_id` chain: an agent whose parent is the root sits at
 * depth 1, its children deeper. No hardcoded agent names.
 */
function buildDepthResolver(handoffs: { agent: string; parent: string; depth: number | null }[]) {
  const depths = handoffs.map((h) => h.depth).filter((d): d is number => d != null);
  const varies = depths.length > 0 && new Set(depths).size > 1;
  // Parent lookup for chain-walking.
  const parentOf = new Map<string, string>();
  for (const h of handoffs) {
    if (h.agent && !parentOf.has(h.agent)) parentOf.set(h.agent, h.parent);
  }
  const roots = new Set<string>();
  for (const h of handoffs) {
    if (!h.parent || !parentOf.has(h.parent)) roots.add(h.parent || h.agent);
  }
  function walkDepth(agent: string, parent: string): number {
    if (!agent) return 0;
    let depth = 0;
    let cur: string | undefined = parent;
    const seen = new Set<string>([agent]);
    while (cur && !seen.has(cur)) {
      depth++;
      if (roots.has(cur)) break;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    // An agent directly under a root sits at depth 1.
    return Math.max(0, depth);
  }
  return (agent: string, parent: string, metaDepth: number | null): number => {
    if (varies && metaDepth != null) return Math.max(0, metaDepth);
    return walkDepth(agent, parent);
  };
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
  return clip(parts.join(', '), 160);
}

/** Coerce a tool's result (object or string) into a raw string for analysis. */
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

/** Extract the ordered tool calls a handoff recorded in meta.tools_called, with
 *  a content-typed result analysis (see analyzeToolResult). */
function extractTools(meta: Record<string, unknown>, blockId: string): DelegationToolCall[] {
  const raw = meta['tools_called'];
  if (!Array.isArray(raw)) return [];
  const out: DelegationToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    const name = str(rec['name']) || str(rec['tool_name']) || 'tool';
    const resultStr = rawResultString(rec['result'] ?? rec['output'] ?? rec['content']);
    const analysis = analyzeToolResult(resultStr);
    out.push({
      id: str(rec['call_id']) || `${blockId}-tool-${i}`,
      name,
      argsSummary: summariseArgs(rec['args'] ?? rec['input']),
      content: analysis.content,
      preview: analysis.preview,
      result: analysis.full,
      ...(analysis.imagePath ? { imagePath: analysis.imagePath } : {}),
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
    a.preview === b.preview &&
    a.result === b.result &&
    a.imagePath === b.imagePath &&
    a.ok === b.ok &&
    a.durationMs === b.durationMs &&
    a.cached === b.cached
  );
}

/**
 * Project an assistant message's parts into the clean ordered turn model — a
 * chat of delegation blocks plus the final answer. Returns null for non-assistant
 * messages or turns that carry no delegation / handoff structure.
 */
export function buildAssistantTurnModel(parts: readonly Part[]): AssistantTurnModel | null {
  const list = parts as readonly PartLike[];
  if (!list.some(isHandoff)) return null;

  // First pass: collect the (agent, parent, depth) of every non-resumed handoff
  // so depth resolution can see the whole turn's nesting.
  const handoffMeta: { agent: string; parent: string; depth: number | null }[] = [];
  for (const part of list) {
    if (!part || part.type !== 'expert_handoff' || isParentResumed(part)) continue;
    const meta = part.metadata ?? {};
    handoffMeta.push({
      agent: str(meta['delegate_to']) || str(meta['agent_id']) || str(meta['expert']),
      parent: str(meta['parent_id']) || str(meta['parent']),
      depth: typeof meta['depth'] === 'number' ? (meta['depth'] as number) : null,
    });
  }
  const resolveDepth = buildDepthResolver(handoffMeta);

  const blocks: DelegationBlock[] = [];
  const passthrough: Part[] = [];
  let routing: AssistantTurnModel['routing'] | undefined;
  const answerChunks: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part) continue;
    const type = part.type ?? '';

    if (type === 'routing_decision') {
      const selected = str(part.selected_agent) || 'main';
      const rationale = str(part.rationale) || str((part.metadata ?? {})['route_reason']);
      const source = str((part.metadata ?? {})['route_source']);
      routing = { selected, rationale, source };
      continue;
    }

    if (type === 'expert_handoff') {
      const meta = part.metadata ?? {};
      const raw = str(meta['output_summary']) || (part.text ?? '').trim() || str(meta['summary']);

      // DEDUPE: a parent.resumed handoff is the structural RETURN twin — folded
      // into the already-emitted block. Detected via the generic `stage`
      // metadata field, never by string-matching prose.
      if (isParentResumed(part)) continue;

      const agent =
        str(meta['delegate_to']) || str(meta['agent_id']) || str(meta['expert']) || 'expert';
      const id = str(part.id) || `block-${i}`;
      const task = str(meta['question']);
      const resultText = handoffResultText(raw);
      const tools = extractTools(meta, id);

      // Skip an utterly empty delegation (no task, no prose, no tools).
      if (!task && !resultText.text.trim() && tools.length === 0) continue;

      const parent = str(meta['parent_id']) || str(meta['parent']) || 'main';
      const metaDepth = typeof meta['depth'] === 'number' ? (meta['depth'] as number) : null;
      const status = str(meta['status']) || 'observed';
      blocks.push({
        id,
        agent,
        parent,
        depth: resolveDepth(agent, parent, metaDepth),
        status,
        task,
        tools,
        result: resultText.text,
      });
      continue;
    }

    if (type === 'text') {
      const cleaned = (part.text ?? '').trim();
      if (cleaned) answerChunks.push(cleaned);
      continue;
    }

    passthrough.push(part as Part);
  }

  const answer = answerChunks.join('\n\n');

  return {
    ...(routing ? { routing } : {}),
    blocks,
    answer,
    passthrough,
  };
}
