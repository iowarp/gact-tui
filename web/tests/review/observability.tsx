import type { AsyncProcess, Run, SubagentRun, ToolInvocation } from '@clio/core/v3';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ClioProcessLanes } from '../../src/components/clio/observability-processes';
import {
  ClioActivityTimeline,
  type ObservabilityActivityItem,
} from '../../src/components/clio/observability-activity';

// Deliberately fictional layout test records. This page never enters a shipped
// build and does not represent a model run or operational acceptance.
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 10, 14, 0, seconds)).toISOString();
const names = ['Balance analyst', 'Availability analyst', 'Capacity reviewer', 'Report reviewer'];
const starts = [8, 18, 24, 105];
const ends = [100, 112, 96, 158];
const processes: AsyncProcess[] = names.map((title, index) => ({
  id: `task-${index}`,
  title,
  kind: 'agent',
  live_state: 'completed',
  status: 'completed',
  root_session_id: 'root',
  owner_session_id: `child-${index}`,
  child_session_id: `child-${index}`,
  parent_session_id: 'root',
  task_path: [`task-${index}`],
  depth: 1,
  created_at: at(starts[index]!),
  updated_at: at(ends[index]!),
  metadata: {},
}));
const subagents: SubagentRun[] = processes.map((process) => ({
  id: process.id,
  session_id: 'root',
  child_session_id: process.child_session_id,
  title: process.title,
  state: 'completed',
}));
const runs: Run[] = [
  {
    id: 'run',
    session_id: 'root',
    state: 'completed',
    started_at: at(0),
    completed_at: at(180),
    summary: 'Compare station availability and publish findings',
  },
];
const tools: ToolInvocation[] = processes.flatMap((process, index) => [
  {
    id: `read-${index}`,
    session_id: process.child_session_id!,
    name: 'fs_read_file',
    title: `Read ${index === 3 ? 'morning-findings.md' : 'bike-stations.csv'}`,
    state: 'succeeded' as const,
    started_at: at(starts[index]! + 2),
    completed_at: at(starts[index]! + 3),
    duration_ms: 1000,
  },
  {
    id: `check-${index}`,
    session_id: process.child_session_id!,
    name: 'shell_bash',
    title: [
      'Compute net station change',
      'Find first empty snapshot',
      'Validate station capacities',
      'Check report against source tables',
    ][index]!,
    state: index === 2 ? ('failed' as const) : ('succeeded' as const),
    started_at: at(starts[index]! + 7),
    completed_at: at(ends[index]! - 12),
    error: index === 2 ? 'Input count exceeds capacity; inspect the offending row.' : undefined,
  },
  {
    id: `publish-${index}`,
    session_id: process.child_session_id!,
    name: 'create_artifact',
    title: `Publish ${['station-balance.csv', 'availability-check.csv', 'capacity-check.csv', 'review-notes.md'][index]}`,
    state: 'succeeded' as const,
    started_at: at(ends[index]! - 5),
    completed_at: at(ends[index]! - 4),
    duration_ms: 1000,
  },
]);

function Review() {
  const [view, setView] = useState('gantt');
  const [opened, setOpened] = useState('');
  const activity: ObservabilityActivityItem[] = processes.flatMap((process) => {
    const common = {
      ownerSessionId: process.child_session_id,
      rootSessionId: 'root',
      ownerLabel: process.title,
      parentSessionId: 'root',
      taskId: process.id,
      depth: 1,
      onOpen: (target: string) => setOpened(`${process.title} · ${target}`),
    };
    return [
      {
        ...common,
        id: `${process.id}-open`,
        kind: 'process' as const,
        label: process.title,
        state: 'completed' as const,
        at: process.created_at,
        lifecycle: 'open' as const,
      },
      ...tools
        .filter((tool) => tool.session_id === process.child_session_id)
        .map((tool) => ({
          ...common,
          id: tool.id,
          kind: 'tool' as const,
          label: tool.title!,
          state: tool.state === 'failed' ? ('failed' as const) : ('completed' as const),
          at: tool.completed_at,
          detail: tool.error,
          onActivate: () => setOpened(tool.title!),
        })),
      {
        ...common,
        id: `${process.id}-close`,
        kind: 'process' as const,
        label: process.title,
        detail: 'Returned evidence to the main agent',
        state: 'completed' as const,
        at: process.updated_at,
        lifecycle: 'close' as const,
      },
    ];
  });
  return (
    <main className="p-3">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <h1>Synthetic multi-agent layout fixture · 4 child agents, 12 tool calls, 3 minutes</h1>
        <nav aria-label="Observability view" className="flex gap-3">
          <button onClick={() => setView('gantt')}>Gantt</button>
          <button onClick={() => setView('timeline')}>Timeline</button>
        </nav>
      </header>
      {view === 'gantt' ? (
        <ClioProcessLanes
          processes={processes}
          runs={runs}
          tools={tools}
          subagents={subagents}
          onOpenSubagent={(child, target) => setOpened(`${child.title} · ${target}`)}
        />
      ) : (
        <ClioActivityTimeline items={activity} messages={[]} />
      )}
      <output aria-label="Opened event">{opened}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <AppearanceProvider>
    <Review />
  </AppearanceProvider>,
);
