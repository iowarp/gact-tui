/**
 * Pure data-transform for ASSISTANT transcript turns, mirroring the TUI's two
 * readability semantics (see tui/internal/ui/execution_supplements.go and
 * semantic_text_summaries.go):
 *
 *  1. DEDUPE — clio emits each delegation TWICE: a `delegate.completed`
 *     handoff (meta.delegate_to set) immediately followed by a
 *     `parent.resumed` handoff (meta.stage === 'parent.resumed') whose text is
 *     a verbatim duplicate. We keep one row per delegation.
 *
 *  2. STRIP — handoff text carries control scaffolding ("Retained typed
 *     workflow state: {…}", "CLIO durable typed workflow state:", a leading
 *     "main -> data | completed | delegate.completed | " status prefix, and a
 *     trailing JSON state blob). We strip all of it and keep the real prose,
 *     mirroring stripSemanticControlContracts.
 *
 *  3. DEPTH — delegation depth is computed from agent metadata so the named
 *     experts (geospatial/data/analysis/visualization/synthesis) sit at depth
 *     1 under `main`, and any nested children deeper (mirrors
 *     timelineAgentDepth / depthForAgent in the TUI).
 *
 * The output is an ordered list of rows the renderer lays out as a flowing,
 * indented transcript instead of a wall of bordered cards.
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

/** A single rendered step in an assistant turn. */
export interface DelegationStep {
  /** Stable key for keyed rendering (part id, or a synthesised fallback). */
  id: string;
  /** Owning agent label (main / geospatial / data / …). */
  agent: string;
  /** Parent agent, when the metadata carried one. */
  parent?: string;
  /** Delegation depth — 0 = main, 1 = named expert, 2+ = nested child. */
  depth: number;
  /** Lifecycle status (completed / failed / running / observed …). */
  status: string;
  /** The cleaned, human-readable model prose (markdown). Never scaffolding. */
  text: string;
}

/** The clean ordered view-model for an assistant turn. */
export interface AssistantTurnModel {
  /** Optional routing chip (kept OUT of the main flow). */
  routing?: {
    selected: string;
    rationale: string;
    source: string;
  };
  /** The delegation steps, in order, deduped + stripped + depth-tagged. */
  steps: DelegationStep[];
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
  const rest = (firstNl >= 0 ? head.slice(consumed) + text.slice(firstNl) : head.slice(consumed));
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
  // `state` is the object after the marker — already `{ workflow_state: {…} }`,
  // so pass it as `structured` directly (reportPreview unwraps workflow_state).
  const preview = reportPreview({
    kind: 'report',
    agent,
    depth: 1,
    structured: state,
    text: raw,
  }).trim();
  // reportPreview's last-resort is stripControlContracts(text), which can still
  // carry the wire status prefix; run it through our prefix stripper to be safe.
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

/**
 * Project an assistant message's parts into the clean ordered turn model.
 *
 * Returns null for non-assistant messages or turns that carry no delegation /
 * handoff structure (those keep the simple flat rendering).
 */
export function buildAssistantTurnModel(parts: readonly Part[]): AssistantTurnModel | null {
  const list = parts as readonly PartLike[];
  if (!list.some(isHandoff)) return null;

  const steps: DelegationStep[] = [];
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
      const rationale =
        str(part.rationale) || str((part.metadata ?? {})['route_reason']);
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
      // The model prose may arrive as the part text or, when the wire omits it,
      // in the output_summary / summary metadata (mirrors ExpertHandoffPartView).
      const raw = (part.text ?? '').trim() || str(meta['output_summary']) || str(meta['summary']);
      const agent =
        str(meta['delegate_to']) || str(meta['agent_id']) || str(meta['expert']) || 'expert';
      // The real model prose, scaffolding removed. A bare leading JSON evidence
      // blob is summarised (mirrors summarizeHandoffDetail); a handoff that is
      // PURE workflow-state scaffolding falls back to a structured evidence
      // summary from the retained typed state (mirrors reportPreview) — so the
      // delegation always shows max information, never a raw JSON dump.
      const cleaned = cleanHandoffText(raw, agent);
      const key = comparable(raw);

      // DEDUPE: drop a parent.resumed whose comparable text duplicates the
      // immediately-preceding delegate.completed.
      if (isParentResumed(part) && key && key === prevHandoffKey) {
        prevHandoffKey = key;
        continue;
      }
      prevHandoffKey = key;
      if (!cleaned.trim()) continue;

      const parent = str(meta['parent_id']) || str(meta['parent']);
      const status = str(meta['status']) || 'observed';
      steps.push({
        id: str(part.id) || `step-${i}`,
        agent,
        ...(parent ? { parent } : {}),
        depth: depthFor(agent, parent),
        status,
        text: cleaned,
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

  return {
    ...(routing ? { routing } : {}),
    steps,
    answer: answerChunks.join('\n\n'),
    passthrough,
  };
}
