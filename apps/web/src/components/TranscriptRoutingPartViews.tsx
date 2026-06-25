/**
 * Part views for routing/handoff parts (model selection, expert handoff,
 * sub-agent routing) shown inline in the transcript.
 */
import { Show } from 'solid-js';
import type { Part } from '@clio/core';
import { Icon } from './Icon.js';

/** A body that is (or is a caption labelling) a bare JSON object/array is
 *  DISPLAY-ONLY structured state per the contract — never rendered as prose. */
function isStructuralBody(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[[{]/.test(t)) return true;
  return /^[^\n{}]{0,80}:\s*\n?\s*[[{]/.test(t);
}

/** clio execution-path chip label (SPEC §4.5). "fast" = deterministic tool
 *  template (no LM); "expert_loop" = full expert tool-loop. */
function executionPathLabel(path: string): string {
  if (path === 'fast') return 'fast path';
  if (path === 'expert_loop') return 'expert loop';
  return '';
}

export function RoutingDecisionPartView(props: { part: Part }) {
  const p = props.part as Part & {
    selected_agent?: string;
    rationale?: string;
    confidence?: number;
    heuristic?: boolean;
    execution_path?: string;
    metadata?: Record<string, unknown>;
  };
  const selected = p.selected_agent ?? '';
  const rationale = p.rationale ?? '';
  const metadata = p.metadata ?? {};
  const reason = String(metadata['route_reason'] ?? '');
  const source = String(metadata['route_source'] ?? '');
  // confidence is 0..1; only surface a meaningful (>0) score.
  const confidence = typeof p.confidence === 'number' && p.confidence > 0 ? p.confidence : undefined;
  const confidencePct = confidence !== undefined ? Math.round(confidence * 100) : undefined;
  // heuristic === true => deterministic keyword match; false => LM router.
  const routedBy = p.heuristic ? 'heuristic' : 'LM-routed';
  const execPath = executionPathLabel(String(p.execution_path ?? ''));
  // Suppress an empty/no-op routing decision (no destination, no source, no
  // rationale) — nothing to show. No backend-specific marker matching.
  if (!source && !rationale && !reason && (!selected || selected === 'main')) {
    return null;
  }
  return (
    <div class="trx-routing" data-testid="routing-decision">
      <span class="trx-routing__icon" aria-hidden>
        <Icon name="branch" size={11} />
      </span>
      <span class="trx-routing__body">
        <span class="trx-routing__head">
          routed to <strong>{selected || 'chat'}</strong>
          <Show when={source}>
            <span class="trx-routing__src"> · {source}</span>
          </Show>
        </span>
        <span class="trx-routing__meta" data-testid="routing-meta">
          <span
            class="trx-routing__tag trx-routing__tag--routedby"
            classList={{ 'trx-routing__tag--lm': !p.heuristic }}
            data-testid="routing-routedby"
          >
            {routedBy}
          </span>
          <Show when={confidencePct !== undefined}>
            <span
              class="trx-routing__confidence"
              data-testid="routing-confidence"
              title={`router confidence ${confidencePct}%`}
            >
              <span class="trx-routing__confidence-bar" aria-hidden>
                <span
                  class="trx-routing__confidence-fill"
                  style={{ width: `${confidencePct}%` }}
                />
              </span>
              <span class="trx-routing__confidence-pct">{confidencePct}%</span>
            </span>
          </Show>
          <Show when={execPath}>
            <span
              class="trx-routing__tag trx-routing__tag--path"
              data-testid="routing-execpath"
            >
              {execPath}
            </span>
          </Show>
        </span>
        <Show when={rationale || reason}>
          <span class="trx-routing__why">{rationale || reason}</span>
        </Show>
      </span>
    </div>
  );
}

export function ExpertHandoffPartView(props: { part: Part }) {
  const p = props.part as Part & {
    metadata?: Record<string, unknown>;
    text?: string;
  };
  const meta = p.metadata ?? {};
  const agent = String(meta['agent_id'] ?? meta['expert'] ?? 'expert');
  const parent = String(meta['parent_id'] ?? meta['parent'] ?? '').trim();
  const status = String(meta['status'] ?? 'observed');
  const output = String(meta['output_summary'] ?? meta['summary'] ?? '').trim();
  const summary = (p.text ?? '').trim();
  // Render the expert's prose IN FULL. metadata.workflow_state is display-only
  // (the contract: clients never rely on specific keys), so a body that is a
  // bare JSON state blob is suppressed — detected structurally, not by matching
  // any backend marker text.
  const body = output || summary;
  const displayDetail = isStructuralBody(body) ? '' : body;
  return (
    <div class="trx-routing">
      <span class="trx-routing__icon" aria-hidden>
        <Icon name="bot" size={11} />
      </span>
      <span class="trx-routing__body">
        <span class="trx-routing__head">
          <Show
            when={parent}
            fallback={
              <>
                handoff to <strong>{agent}</strong>
              </>
            }
          >
            handoff <strong>{parent}</strong> → <strong>{agent}</strong>
          </Show>
          <span class="trx-routing__src"> · {status}</span>
        </span>
        <Show when={displayDetail}>
          <span class="trx-routing__why">{displayDetail}</span>
        </Show>
      </span>
    </div>
  );
}
