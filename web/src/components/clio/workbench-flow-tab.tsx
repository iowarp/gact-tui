import type { SubagentRun } from '@clio/core/v3';
import { useLiveStore } from '@/store/live-store';
import { FlowRunView } from './flow-run-view';
import type { SubagentOpenTarget } from './subagent-card';
import type { WorkbenchTab } from './workbench-shared';

/**
 * A flow run as a workbench tab: the conversation it ran in › its name, then
 * the run under the same frame bar a subagent's transcript has.
 */
export function WorkbenchFlowTab({
  tab,
  onOpenSubagent,
}: {
  tab: Extract<WorkbenchTab, { kind: 'flow' }>;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}) {
  const conversation = useLiveStore((state) => state.entities.sessions[tab.sessionId]?.title);
  return (
    <FlowRunView
      crumbs={
        conversation ? [{ label: conversation }, { label: tab.label }] : [{ label: tab.label }]
      }
      handle={tab.handle}
      label={tab.label}
      onOpenSubagent={onOpenSubagent}
      sessionId={tab.sessionId}
    />
  );
}
