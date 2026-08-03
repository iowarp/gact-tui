/**
 * Inspector 'Run info' tab: per-run/session metadata readout. Exports
 * {@link RunInfoTab}.
 */
import { Show } from 'solid-js';
import type { Message } from '@clio/core';
import { formatCostUsd } from '../formatters.js';
import { humanNum } from '../presentationUtils.js';
import { stopReasonTone } from '../statusTones.js';

export interface RunInfoTabProps {
  message: Message | null;
  model?: string;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd: number;
}

export function RunInfoTab(props: RunInfoTabProps) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Run</div>
      <dl class="inspector__kv">
        <Show when={props.message?.stop_reason}>
          <dt>stop_reason</dt>
          <dd>
            <span
              class={
                'inspector__chip inspector__chip--' +
                stopReasonTone(props.message!.stop_reason ?? undefined)
              }
            >
              {props.message!.stop_reason}
            </span>
          </dd>
        </Show>
        <Show when={props.model}>
          <dt>model</dt>
          <dd>{props.model}</dd>
        </Show>
        <Show when={(props.tokens?.input ?? 0) + (props.tokens?.output ?? 0) > 0}>
          <dt>tokens</dt>
          <dd>
            <span class="inspector__num">{humanNum(props.tokens?.input ?? 0)}</span>
            <span class="inspector__num-sep">→</span>
            <span class="inspector__num">{humanNum(props.tokens?.output ?? 0)}</span>
          </dd>
        </Show>
        <Show when={props.costUsd > 0}>
          <dt>cost</dt>
          <dd class="inspector__num">${formatCostUsd(props.costUsd)}</dd>
        </Show>
      </dl>
    </section>
  );
}
