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
