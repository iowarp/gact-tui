import { flowRunActive, sessionAgentRef, type FlowRun } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { FLOW_RUN_POLL_MS, useFlowTaskTimes } from '@/hooks/use-flow-run';
import { useNow } from '@/hooks/use-now';
import { useRepository } from '@/hooks/use-repository';
import { useSessionAgent } from '@/hooks/use-session-agent';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import {
  closingStep,
  workflowAgentflowSource,
  seriesParallel,
} from '@/components/clio/flow-diagram-source';
import {
  callsRailroadExpr,
  membersRailroadExpr,
  railroadDiagram,
  workflowRailroadExpr,
  type RailroadDiagram,
  type RailroadExpr,
} from '@/components/clio/flow-railroad';
import {
  flowMembers,
  flowVerdict,
  workflowSteps,
  type FlowMember,
  type FlowState,
  type FlowStep,
  type FlowVerdict,
} from '@/components/clio/flow-run-presentation';
import { flowToolDescriptor } from '@/components/clio/flow-tool-presentation';
import { formatDuration } from '@/lib/format';

/** How a run is drawn: as a railroad, or as a graph with the reason it is not a railroad. */
export type FlowDiagramSpec =
  | { kind: 'railroad'; railroad: RailroadDiagram; label: string }
  | { kind: 'graph'; source: string; label: string; note: string };

export interface FlowPresentation {
  /** Workflow steps; empty for a flow without a workflow. */
  steps: FlowStep[];
  /** Council members, arena entries or other calls; empty for a workflow. */
  members: FlowMember[];
  verdict: FlowVerdict;
  /** A council's synthesis or an arena's judge, with its state. */
  closing?: { label: string; state: FlowState };
  /** How long each step or member took, or has been running. Unit: milliseconds. */
  elapsed: ReadonlyMap<string, number>;
  diagram?: FlowDiagramSpec;
  /** The whole run's time so far, from its first task. Unit: milliseconds. */
  runElapsed?: number;
  /** What each flow this agent can run is, by id: its plugin, description and shape. */
  flows: ReadonlyMap<string, FlowInfo>;
}

/** A flow as the person reads it before or while it runs. */
export interface FlowInfo {
  id: string;
  plugin: string;
  description: string;
  shape: string;
}

/** Shown under a graph drawn in place of the railroad, so the switch is never silent. */
export const NOT_SERIES_PARALLEL_NOTE =
  "Drawn as a graph: some steps wait on only part of a parallel group, so the workflow can't be laid out as one track of sequences and parallel branches.";

/**
 * The session's own agent reference, so a step it runs reads as "this agent":
 * the pinned resolution when the service reports it, else the session's pin.
 */
export function useSessionAgentRef(sessionId: string): string {
  const session = useLiveStore((state) => state.entities.sessions[sessionId]);
  const { agent } = useSessionAgent(sessionId);
  return agent.data?.resolution.agent.ref || sessionAgentRef(session);
}

/** The arguments of the run_flow / run_workflow call that started the flow under `handle`. */
export function useFlowToolArgs(handle: string): Record<string, unknown> | undefined {
  const tools = useLiveStore((state) => state.entities.tools);
  return useMemo(() => {
    for (const tool of Object.values(tools)) {
      if (!['run_flow', 'run_workflow'].includes(tool.name)) continue;
      const descriptor = flowToolDescriptor(tool);
      if (descriptor?.handle === handle) return descriptor.args;
    }
    return undefined;
  }, [handle, tools]);
}

/** The runs of workflow steps that are flows themselves, read again while they run. */
function useNestedFlowRuns(sessionId: string, steps: readonly FlowStep[], enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const nested = steps.filter(
    (step): step is FlowStep & { handle: string } => step.kind === 'flow' && Boolean(step.handle),
  );
  const results = useQueries({
    queries: nested.map((step) => ({
      queryKey: queryKeys.key('task-flow', settings.endpoint, sessionId, step.handle),
      enabled,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        repository.taskFlow(sessionId, step.handle, signal),
      retry: false,
      refetchInterval: (query: { state: { data?: FlowRun | null } }) =>
        query.state.data && flowRunActive(query.state.data) ? FLOW_RUN_POLL_MS : false,
    })),
  });
  return new Map(
    nested.flatMap((step, index) => {
      const data = results[index]?.data;
      return data ? [[step.id, data] as const] : [];
    }),
  );
}

/** A nested run as its inline track; its own nested flows are drawn as steps. */
export function nestedFlowExpr(run: FlowRun, agentRef: string): RailroadExpr | undefined {
  if (run.view || run.execution?.length) {
    const steps = workflowSteps(run, agentRef).map((step) =>
      step.kind === 'flow' ? { ...step, kind: 'agent' as const } : step,
    );
    const shape = seriesParallel(steps);
    return shape ? workflowRailroadExpr(steps, shape) : undefined;
  }
  const members = flowMembers(run, agentRef);
  if (!members.length) return undefined;
  if (!['council', 'arena'].includes(run.flow)) return callsRailroadExpr(members);
  const verdict = flowVerdict(run);
  return membersRailroadExpr(
    members,
    closingStep(run.flow, run.status, members, verdict),
    run.flow,
    verdict,
  );
}

/** Everything the card, the panel and the full-screen view present for one run. */
/**
 * How long a flow run took (or has taken): its root task's span. A run with a root task
 * waits for that task's time, because the members load one by one and their partial span
 * reads as a much shorter run; a run without one spans its members.
 */
export function flowRunElapsed(
  run: FlowRun | null | undefined,
  rootHandle: string,
  times: ReadonlyMap<string, { startedAt: number; settledAt?: number }>,
  now: number,
): number | undefined {
  if (!run) return undefined;
  const root = rootHandle ? times.get(rootHandle) : undefined;
  if (root) return (run.status === 'running' ? now : (root.settledAt ?? now)) - root.startedAt;
  if (rootHandle || !times.size) return undefined;
  const starts = [...times.values()].map((time) => time.startedAt);
  const ends = [...times.values()].map((time) => time.settledAt ?? now);
  return (run.status === 'running' ? now : Math.max(...ends)) - Math.min(...starts);
}

export function useFlowPresentation(
  run: FlowRun | null | undefined,
  agentRef: string,
  args: Record<string, unknown> | undefined,
  sessionId: string,
  enabled = true,
): FlowPresentation {
  const model = useMemo(() => {
    if (!run) return { steps: [], members: [], verdict: {} as FlowVerdict };
    const steps = workflowSteps(run, agentRef);
    const members = run.view || run.execution?.length ? [] : flowMembers(run, agentRef, args);
    return { steps, members, verdict: flowVerdict(run) };
  }, [agentRef, args, run]);
  const nested = useNestedFlowRuns(sessionId, model.steps, enabled);
  const { agent } = useSessionAgent(sessionId);
  const catalog = agent.data?.resolution.flows;
  const flows = useMemo(
    () =>
      new Map(
        (catalog ?? []).map((row) => [
          row.id,
          { id: row.id, plugin: row.plugin, description: row.description, shape: row.shape ?? '' },
        ]),
      ),
    [catalog],
  );
  const rootHandle = run?.root_handle ?? '';
  const rootSettled = run !== null && run !== undefined && run.status !== 'running';
  const tasks = useMemo(
    () => [
      ...[...model.steps, ...model.members].map((row) => ({
        handle: row.handle,
        settled: !['running', 'waiting'].includes(row.status.tone),
      })),
      // The flow's own task bounds the run; its members load one by one.
      ...(rootHandle ? [{ handle: rootHandle, settled: rootSettled }] : []),
    ],
    [model, rootHandle, rootSettled],
  );
  const legacyTimes = useFlowTaskTimes(run?.timings || !enabled ? [] : tasks);
  const times = useMemo(() => {
    if (!run?.timings) return legacyTimes;
    const recorded = new Map<string, { startedAt: number; settledAt?: number }>();
    for (const [handle, time] of Object.entries(run.timings)) {
      const startedAt = Date.parse(time.created_at);
      if (!Number.isFinite(startedAt)) continue;
      const settledAt = time.terminal_at ? Date.parse(time.terminal_at) : undefined;
      recorded.set(handle, {
        startedAt,
        ...(settledAt !== undefined && Number.isFinite(settledAt) ? { settledAt } : {}),
      });
    }
    return recorded;
  }, [run?.timings, legacyTimes]);
  const ticking = tasks.some((task) => task.handle && !task.settled);
  const now = useNow(ticking && enabled);
  const elapsed = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of [...model.steps, ...model.members]) {
      const time = row.handle ? times.get(row.handle) : undefined;
      if (!time) continue;
      const key = 'id' in row ? row.id : row.key;
      if (time.settledAt !== undefined) result.set(key, time.settledAt - time.startedAt);
      else if (row.status.tone === 'running') result.set(key, now - time.startedAt);
    }
    return result;
  }, [model, now, times]);
  // The nested runs' identity changes every render; their states are what matter.
  const nestedKey = [...nested]
    .map(([id, value]) => `${id}:${value.status}:${value.entries}:${value.calls.length}`)
    .join(',');
  const diagrams = useMemo(
    () => flowDiagrams(run, model, nested, agentRef),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [run, model, agentRef, nestedKey],
  );
  const runElapsed = flowRunElapsed(run, rootHandle, times, now);
  return { ...model, ...diagrams, elapsed, runElapsed, flows };
}

/**
 * The diagram of a run: a railroad whenever the flow's shape is nested
 * sequences and parallel branches, else the workflow graph with the reason.
 */
export function flowDiagrams(
  run: FlowRun | null | undefined,
  model: { steps: FlowStep[]; members: FlowMember[]; verdict: FlowVerdict },
  nested: ReadonlyMap<string, FlowRun> = new Map(),
  agentRef = '',
): Pick<FlowPresentation, 'diagram' | 'closing'> {
  if (!run) return {};
  if (run.view || run.execution?.length) {
    const steps = model.steps;
    if (!steps.length) return {};
    const shape = seriesParallel(steps);
    if (!shape) {
      return {
        diagram: {
          kind: 'graph',
          source: workflowAgentflowSource(steps, new Map()),
          label: `Workflow graph of ${steps.length} steps and what each waits on`,
          note: NOT_SERIES_PARALLEL_NOTE,
        },
      };
    }
    const subflows = new Map(
      [...nested].flatMap(([id, value]) => {
        const expr = nestedFlowExpr(value, agentRef);
        return expr ? [[id, expr] as const] : [];
      }),
    );
    const railroad = railroadDiagram('workflow', workflowRailroadExpr(steps, shape, subflows));
    // Recovered launches establish ownership, not the original gather structure.
    if (run.calls.some((call) => call.recovered)) railroad.parallels = [];
    return {
      diagram: {
        kind: 'railroad',
        railroad,
        label: `The workflow's ${steps.length} steps in order: ${steps
          .map((step) => `${step.id}, ${step.status.word}`)
          .join('; ')}`,
      },
    };
  }
  const members = model.members;
  if (!members.length) return {};
  if (!['council', 'arena'].includes(run.flow)) {
    // Council and arena end in a step that is not a call (their synthesis, their judge);
    // any other flow is what it called.
    const expr = callsRailroadExpr(members);
    return expr
      ? {
          diagram: {
            kind: 'railroad',
            railroad: railroadDiagram(run.flow, expr),
            label: `The ${run.flow} flow's ${members.length} calls as they ran: ${members
              .map((member) => `${member.label}, ${member.status.word}`)
              .join('; ')}`,
          },
        }
      : {};
  }
  const closing = closingStep(run.flow, run.status, members, model.verdict);
  const word = (member: FlowMember) =>
    member.chosen ? `${member.status.word}, chosen` : member.status.word;
  return {
    closing,
    diagram: {
      kind: 'railroad',
      railroad: railroadDiagram(
        run.flow,
        membersRailroadExpr(members, closing, run.flow, model.verdict),
      ),
      label: `${members.map((member) => `${member.label}, ${word(member)}`).join('; ')}; then the ${closing.label}, ${closing.state.word}`,
    },
  };
}

/** A duration as the panel shows it: "42 s", "3 min 5 s". */
export function rowDuration(milliseconds: number | undefined): string {
  return milliseconds === undefined ? '' : formatDuration(milliseconds);
}
