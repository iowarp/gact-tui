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
import type { Message, Part } from '@clio/core';
import { analyzeToolResult } from './toolResultPreview.js';
import type { ToolResultContent } from './toolResultContent.js';

/** A single tool call row (a tool_call part, joined to its tool_result by id). */
export interface ToolRow {
  kind: 'tool';
  id: string;
  depth: number;
  agent: string;
  providerThinking?: ProviderThinking;
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
  /** Tool-telemetry (capabilities.tool_telemetry): the result was served from
   *  cache (clio ships `cached` on tool_result parts). Rendered as an inline
   *  `cached` badge in the tool footer — TUI parity, not dropped by unification. */
  cached?: boolean;
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
  providerThinking?: ProviderThinking;
  /** The typed workflow contract PASSED DOWN to the child on this call, carried
   *  on `metadata.workflow_state` of the `delegate.started` part (the snapshot
   *  the server attaches via clio-agent #888). Present ONLY when a non-empty
   *  object; the #305 contract icon renders off this. Older wires don't carry it
   *  on started rows, so it is `undefined` and the icon simply doesn't render. */
  workflowState?: Record<string, unknown>;
}

/** An agent's prose (markdown, in full). */
export interface TextRow {
  kind: 'text';
  id: string;
  depth: number;
  agent: string;
  text: string;
  /** True when this row is the USER's prompt (rendered plainly — no `●` marker,
   *  no agent header — through the same single AssistantTurnView path). */
  isUser?: boolean;
  /** The DSPy contract field this text streamed from (`signature_field_name`):
   *  `next_thought` (a ReAct step/finish summary) vs `reasoning` (the extract
   *  wrap-up). Used to drop the finish `next_thought` that duplicates the extract
   *  `reasoning` (B1). Absent for non-DSPy backends. */
  field?: string;
  providerThinking?: ProviderThinking;
}

/** An agent's `thinking` step (markdown, in full, muted). */
export interface ReasoningRow {
  kind: 'reasoning';
  id: string;
  depth: number;
  agent: string;
  text: string;
  providerThinking?: ProviderThinking;
}

/** Provider-internal thinking/debug stream, hidden by default. */
export interface ProviderThinking {
  text: string;
  source: string;
  chars?: number;
  tokens?: number;
}

/** The orchestrator's routing decision (kept inline, subtle). */
export interface RoutingRow {
  kind: 'routing';
  id: string;
  depth: number;
  selected: string;
  source: string;
}

/** A child agent's hand-back to its parent. The return contract is exactly two
 *  fields — `{ output/answer , workflow_state }` (#885): `output` is the child's
 *  parent-bound answer BYTE-FOR-BYTE (never a server-authored summary), and
 *  `workflow_state` rides on the row as a typed carrier (not rendered in the
 *  disclosure). A FAILED return carries `output === ''` and the failure surfaces
 *  from the typed `status`/`error` fields (#882) — the client never reads a
 *  server-synthesized failure sentence out of `output`. */
export interface ReturnRow {
  kind: 'return';
  id: string;
  depth: number;
  agent: string;
  parent: string;
  /** The child's parent-bound answer, VERBATIM. `''` on failure. May legitimately
   *  be a bare JSON body when the child's deliverable is structured — the client
   *  renders it verbatim behind `show more` and never filters/summarizes it. */
  output: string;
  /** Typed delegation status (`completed` | `failed` | …). Drives the failure
   *  render when `output` is empty. */
  status?: string;
  /** Typed failure detail (`error`/`message`) surfaced when the child failed. */
  error?: string;
  chars?: number;
  tokens?: number;
  providerThinking?: ProviderThinking;
  /** The typed workflow contract RETURNED UP to the parent, carried on
   *  `metadata.workflow_state` of the `delegate.completed` part. Present ONLY
   *  when a non-empty object; the #305 contract icon renders off this. Never
   *  rendered as the answer (that is `output`, #885) — a typed carrier only. */
  workflowState?: Record<string, unknown>;
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
  thinking?: string;
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
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Whether a TYPED delegation `status` enum denotes a failure. Keys on the
 *  structured status field (`failed`/`error`/`blocked`), NOT on model prose — a
 *  failed return renders from typed fields (#882), never from scraped text. */
export function isFailedStatus(status: string | undefined): boolean {
  return !!status && /fail|block|error/i.test(status);
}

/** Trim an agent's prose. The client is a VERBATIM renderer (epic #880): the
 *  server owns the clean stream, so no scaffolding/status-prefix scrubbing runs
 *  here — only whitespace trimming, which is not a content change. */
function cleanProse(raw: string): string {
  return raw.trim();
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
  const seen = new Set<string>();
  tools.forEach((tool, idx) => {
    if (!tool || typeof tool !== 'object') return;
    const rec = tool as Record<string, unknown>;
    if (shouldHideSupplementalTool(rec)) return;
    const resultStr = extractToolResultText(rec['result'] ?? rec['output']);
    const analysis = analyzeToolResult(resultStr);
    const callId = str(rec['call_id']) || str(rec['id']) || String(idx);
    const name = str(rec['name']) || str(rec['tool_name']) || 'tool';
    const argsSummary = summariseArgs(rec['args'] ?? rec['input']);
    const comparable = `${name}\n${argsSummary}\n${analysis.full || resultStr}`;
    if (seen.has(comparable)) return;
    seen.add(comparable);
    const duration = rec['duration_ms'];
    rows.push({
      kind: 'tool',
      id: `tool-${baseId}-${callId}`,
      depth,
      agent,
      thought: cleanProse(str(rec['thought']) || str(rec['reasoning'])),
      name,
      argsSummary,
      content: analysis.content,
      preview: analysis.preview,
      result: analysis.full,
      ...(analysis.imagePath ? { imagePath: analysis.imagePath } : {}),
      ok: rec['ok'] !== false && rec['is_error'] !== true,
      ...(typeof duration === 'number' ? { durationMs: duration } : {}),
      ...(rec['cached'] === true ? { cached: true } : {}),
    });
  });
  return rows;
}

function shouldHideSupplementalTool(tool: Record<string, unknown>): boolean {
  const name = str(tool['name']) || str(tool['tool_name']);
  if (!name) return false;
  if (name === 'finish') return true;
  if (name.startsWith('clio_')) return true;
  const telemetry = str(tool['telemetry_source']);
  if (telemetry === 'blueprint_react_context_seed') return true;
  return false;
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

/** Read a delegation return's `output` as the child's answer, VERBATIM (#885).
 *  A string passes through byte-for-byte (no trim — `show more` is byte-for-byte
 *  the child's parent-bound answer); a non-string deliverable is serialized once.
 *  There is NO field-picking, summarizing, or cleaning — whatever the child
 *  returned is what the row stores and the UI shows. */
function readOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return rawResultString(value);
}

/** Read the typed `workflow_state` carrier off a handoff's metadata. Returns the
 *  object ONLY when it is a NON-EMPTY plain object — an absent, null, non-object,
 *  or empty (`{}`) state yields `undefined`, so the #305 contract icon renders
 *  exactly when there is real state to show (and degrades to nothing on older
 *  wires that omit it). No field-picking or reshaping: the exact typed object is
 *  surfaced onto the row, byte content preserved for the popup. */
function readWorkflowState(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
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
 * Project a USER turn into the same ordered row log. A user message is its prompt
 * prose (rendered plainly — no `●` marker, no agent header) plus any attachments
 * (images / documents) as passthrough rows. Kept trivially simple: no delegation,
 * tool-pairing, or scaffolding-stripping applies to what the user typed.
 */
function buildUserTurnModel(list: readonly PartLike[]): AssistantTurnModel | null {
  const rows: TurnRow[] = [];
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (!part) continue;
    const id = str(part.id) || `row-${i}`;
    if (part.type === 'text') {
      const text = str(part.text);
      if (!text) continue;
      rows.push({ kind: 'text', id, depth: 0, agent: '', text, isUser: true });
      continue;
    }
    rows.push({ kind: 'passthrough', id, depth: 0, part: part as Part });
  }
  return rows.length > 0 ? { rows } : null;
}

export function buildAssistantTurnModel(
  parts: readonly Part[],
  opts?: { role?: 'user' | 'assistant' },
): AssistantTurnModel | null {
  const list = parts as readonly PartLike[];
  // TOTAL builder (the single render path): EVERY turn — user prompts, delegation
  // turns, single-agent turns, tool-only turns, and turns still streaming their
  // first token — is projected into the ordered row log and rendered through
  // AssistantTurnView. There is no flat per-part fallback anymore: one builder,
  // one renderer, so live ≡ reload and search never swaps to a different view.
  if (opts?.role === 'user') return buildUserTurnModel(list);

  const depthOf = buildDepthResolver(list);
  const rows: TurnRow[] = [];
  // Tool rows indexed by call_id so a later tool_result joins its tool_call.
  const toolByCall = new Map<string, ToolRow>();

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
      const task =
        cleanProse(str(part.metadata?.['question'])) ||
        cleanProse(str(part.metadata?.['input']));
      if (stage === 'delegate.completed' || stage === 'completed') {
        // The delegation's terminal RETURN lane. The server mints exactly ONE header
        // per delegation at `delegate.started` and routes every conclusion — success
        // AND failure (a failed delegation carries stage `delegate.completed` with
        // status `failed`) — here (#882), so a concluded delegation contributes only
        // its return + tool rows, never a second header. The client is a verbatim
        // renderer (#880): no dedup. The preceding dspy.extract (SDK thinking host +
        // `reasoning`) streams in the flow like every other turn; the return stays a
        // clean one-liner (`↩ child returns to parent · show details`).
        rows.push(...toolRowsFromHandoffMetadata(part.metadata?.['tools_called'], agent, depth, id));
        const status = str(part.status) || str(part.metadata?.['status']);
        const error = str(part.metadata?.['error']) || str(part.metadata?.['message']);
        rows.push({
          kind: 'return',
          id: `return-${id}`,
          depth: depthOf(agent),
          agent,
          parent,
          // `output` is the child's parent-bound answer, BYTE-FOR-BYTE (#885): the
          // sole content field, shown VERBATIM behind `show more`. It is NOT a
          // server-authored summary and NOT re-cleaned here — a structured
          // deliverable renders as the exact bytes the child returned (a bare JSON
          // body is legitimate). A failed return carries `output === ''`; the
          // failure rides the typed `status`/`error` fields, never a synthesized
          // sentence scraped back out of `output`.
          output: readOutput(part.metadata?.['output']),
          ...(status ? { status } : {}),
          ...(error ? { error } : {}),
          // The typed workflow contract returned UP to the parent (#305). A typed
          // carrier only — surfaced verbatim onto the row for the contract icon,
          // never rendered as the answer (that is `output`, #885).
          ...(readWorkflowState(part.metadata?.['workflow_state'])
            ? { workflowState: readWorkflowState(part.metadata?.['workflow_state'])! }
            : {}),
        });
        continue;
      }
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
        // The delegated task: the question sent down, else the raw `input`. There
        // is NO `output_summary` fallback (removed with the summary layer, #885).
        // Rendered VERBATIM (epic #880): the server owns the clean stream, so
        // cleanProse only trims — no scaffolding scrub.
        task,
        status: str(part.status) || str(part.metadata?.['status']) || 'observed',
        // The typed workflow contract PASSED DOWN to the child on this call (#305),
        // attached to the `delegate.started` part by clio-agent #888. Absent on
        // older wires → `undefined` → the contract icon simply doesn't render.
        ...(readWorkflowState(part.metadata?.['workflow_state'])
          ? { workflowState: readWorkflowState(part.metadata?.['workflow_state'])! }
          : {}),
      });
      continue;
    }

    if (type === 'text') {
      // A synthetic slash-command result (e.g. `/cache-stats`) is a distinct card,
      // not model prose — route it through its own view as a passthrough row so the
      // single render path still shows it, styled as a command-result card.
      if (str(part.metadata?.['synthetic']) === 'command_result') {
        rows.push({ kind: 'passthrough', id, depth, part: part as Part });
        continue;
      }
      const text = cleanProse(str(part.text));
      if (!text) continue;
      const field = str(part.metadata?.['signature_field_name']);
      rows.push({ kind: 'text', id, depth, agent, text, ...(field ? { field } : {}) });
      continue;
    }

    if (type === 'thinking') {
      const text = cleanProse(str(part.thinking) || str(part.text));
      if (!text) continue;
      if (str(part.metadata?.['thinking_source']) === 'provider') {
        // Per-burst thinking HOST: an empty-text reasoning row whose
        // providerThinking is the SDK thinking, attributed to THIS part's agent.
        // Consecutive provider-thinking for the same agent accumulates into the
        // open host (one burst); a non-thinking row closes it. Renders as the
        // collapsed `thinking ▾`, identical to the live stream.
        const last = rows[rows.length - 1];
        if (last?.kind === 'reasoning' && last.agent === agent && !last.text.trim() && last.providerThinking) {
          const combined = `${last.providerThinking.text}\n${text}`;
          last.providerThinking = { ...last.providerThinking, text: combined, chars: combined.length };
        } else {
          rows.push({
            kind: 'reasoning',
            id: `reasoning-${id}`,
            depth,
            agent,
            text: '',
            providerThinking: {
              text,
              source: str(part.metadata?.['provider_source']) || 'provider',
              chars: text.length,
            },
          });
        }
        continue;
      }
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
        // Render the thought VERBATIM (clio #732 / epic #880): the server now
        // guarantees single-representation — next_thought owns its visible text
        // row and tool_call.thought carries the copy ONLY when there is no
        // visible row — so the client no longer dedups. cleanProse is unrelated
        // (non-S2) scaffolding cleanup and stays.
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
      const cached = part.cached === true || part.metadata?.['cached'] === true;
      if (existing) {
        existing.content = analysis.content;
        existing.preview = analysis.preview;
        existing.result = analysis.full;
        if (analysis.imagePath) existing.imagePath = analysis.imagePath;
        existing.ok = ok;
        if (durationMs != null) existing.durationMs = durationMs;
        if (cached) existing.cached = true;
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
          ...(cached ? { cached: true } : {}),
        });
      }
      continue;
    }

    // Everything else (image / file_diff / document / …) is a passthrough row,
    // rendered in place by its own per-type view.
    rows.push({ kind: 'passthrough', id, depth, part: part as Part });
  }

  const cleanRows = filterVisibleRows(rows);
  if (cleanRows.length === 0) return null;
  return { rows: cleanRows };
}

/**
 * The ordered text strings a message renders, for in-transcript search. Search
 * highlighting + match navigation MUST index the SAME text the single render path
 * shows (cleaned prose rows), not the raw wire parts — otherwise a match key would
 * point at an occurrence that scaffolding-stripping removed, and autoscroll would
 * miss. Both the match counter and the per-row base index derive from this, so
 * `${messageId}:${globalMatchIndex}` keys line up with the rendered `<mark>`s.
 */
export function messageSearchTexts(msg: Message): string[] {
  const model = buildAssistantTurnModel(msg.parts ?? [], {
    role: msg.role === 'assistant' ? 'assistant' : 'user',
  });
  if (!model) return [];
  const out: string[] = [];
  for (const row of model.rows) {
    if (row.kind === 'text' && row.text) out.push(row.text);
  }
  return out;
}

/**
 * Drop only STRUCTURALLY empty rows from the ordered log. The client is a
 * VERBATIM renderer (epic #880): the server owns the clean stream, so there is NO
 * content dedup, body-shape, or placeholder scrubbing here — any genuine backend
 * double-emit or placeholder is fixed at the SOURCE, not hidden in the render.
 * This filter behaves IDENTICALLY live and reloaded (no streaming branch), so a
 * turn renders the same in-flight as it does after a reload.
 */
export function filterVisibleRows(rows: TurnRow[]): TurnRow[] {
  return rows.filter((row) => {
    if (row.kind === 'return') {
      // Keep a return that carries the child's answer (`output`) OR a failure
      // conclusion (empty `output` but a typed `error`/failed `status`, #882).
      // Drop only empty chrome. This keys on emptiness + typed status, never on
      // model wording.
      if (row.output.trim()) return true;
      if (row.error?.trim()) return true;
      return isFailedStatus(row.status);
    }
    if (row.kind !== 'text' && row.kind !== 'reasoning') return true;
    const body = row.text.trim();
    if (!body) {
      // A reasoning row that HOSTS a live thinking disclosure has empty text (the
      // thinking lives in providerThinking) — keep it so the collapsed `thinking ▾`
      // renders. Drop only genuinely empty rows.
      return row.kind === 'reasoning' && !!row.providerThinking?.text.trim();
    }
    return true;
  });
}

