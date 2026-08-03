/**
 * UI component: Workflow State. Exports `WorkflowStateCard`.
 */
import { For, Show } from 'solid-js';
import { Icon } from './Icon.js';
import {
  prettyJson,
  workflowRows,
  type WorkflowBlockerSummary,
} from './WorkflowStateModel.js';

export {
  isRecord,
  prettyJson,
  splitWorkflowState,
  summarizeHandoffDetail,
  turnWorkflowBlocker,
} from './WorkflowStateModel.js';
export type { WorkflowBlockerSummary } from './WorkflowStateModel.js';

export function WorkflowStateCard(props: { state: Record<string, unknown>; raw: string }) {
  const rows = () => workflowRows(props.state);
  const hasError = () => rows().some((row) => row.tone === 'err');
  return (
    <section
      class={'trx-workflow' + (hasError() ? ' trx-workflow--err' : '')}
      data-testid="workflow-state-card"
    >
      <div class="trx-workflow__head">
        <Icon name={hasError() ? 'alert' : 'branch'} size={13} />
        <span>{hasError() ? 'Workflow blocker' : 'Workflow state'}</span>
      </div>
      <Show
        when={rows().length > 0}
        fallback={<p class="trx-workflow__empty">Structured state captured.</p>}
      >
        <dl class="trx-workflow__grid">
          <For each={rows().slice(0, 8)}>
            {(row) => (
              <div class="trx-workflow__row">
                <dt>{row.label}</dt>
                <dd>
                  <span class={'trx-workflow__status trx-workflow__status--' + row.tone}>
                    {row.status}
                  </span>
                  <Show when={row.detail}>
                    <span class="trx-workflow__detail">{row.detail}</span>
                  </Show>
                </dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
      <details class="trx-workflow__raw">
        <summary>Raw state</summary>
        <pre>{prettyJson(props.raw)}</pre>
      </details>
    </section>
  );
}

export function TurnWorkflowBlocker(props: { summary: WorkflowBlockerSummary }) {
  return (
    <aside class="trx-turn-blocker" data-testid="turn-workflow-blocker" role="note">
      <span class="trx-turn-blocker__icon">
        <Icon name="alert" size={13} />
      </span>
      <div class="trx-turn-blocker__body">
        <div class="trx-turn-blocker__title">{props.summary.title}</div>
        <div class="trx-turn-blocker__detail">{props.summary.detail}</div>
      </div>
    </aside>
  );
}
