import type {
  AsyncProcess,
  PendingInteraction,
  Run,
  SessionDiff,
  SubagentRun,
  ToolInvocation,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservabilityViewControl } from './observability-view-control';
import { QuestionAnswerContext } from './question-answer-context';
import { ClioWorkbench } from './workbench';
import {
  WorkbenchActivityProvider,
  type WorkbenchActivitySource,
} from './workbench-activity-source';
import { useWorkTaskFocus } from './work-task-focus';

const { repository, sessionWork } = vi.hoisted(() => ({
  repository: { readWorkspaceFile: vi.fn(), readWorkspaceFileRange: vi.fn() },
  sessionWork: vi.fn(() => ({ data: undefined as unknown })),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: false }),
  useTranscriptPreviewLines: () => 5,
}));
vi.mock('./use-session-work', () => ({ useSessionWork: sessionWork }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const runs = [
  { id: 'r1', session_id: 's', state: 'completed', started_at: '2026-01-01T10:00:00Z' },
  { id: 'r2', session_id: 's', state: 'running', started_at: '2026-01-01T11:00:00Z' },
] as unknown as Run[];
const tools = [
  {
    id: 'fetch',
    name: 'ndp_fetch',
    state: 'completed',
    run_id: 'r2',
    duration_ms: 40,
    input: { dataset: 'smap_l3' },
    output: 'rows: 12',
  },
  {
    id: 'read',
    name: 'fs_read_file',
    state: 'completed',
    run_id: 'r2',
    duration_ms: 12,
    input: { path: 'data/soil_sites.csv' },
  },
  { id: 'old', name: 'ndp_search', state: 'completed', run_id: 'r1', duration_ms: 9 },
] as unknown as ToolInvocation[];
const diff = {
  id: 'chg_1',
  path: 'scripts/regrid_stations.py',
  status: 'applied',
  created: false,
  undo_available: true,
  lines_added: 2,
  lines_removed: 1,
  recorded_at: '2026-01-01T11:02:00Z',
  unified_diff: '@@ -1 +1,2 @@\n-old\n+new\n+more',
} as unknown as SessionDiff;
const download = {
  id: 'p1',
  handle: 'task_1',
  kind: 'mcp-task',
  task_kind: 'Download',
  title: 'Downloading SMAP L3',
  live_state: 'running',
  status: 'running',
  progress: { completed: 62, total: 100 },
  supported_actions: ['cancel'],
  created_at: '2026-01-01T11:00:00Z',
} as unknown as AsyncProcess;
const subagent = {
  id: 'sa1',
  title: 'Survey soil sensors',
  state: 'running',
  child_session_id: 'child_1',
} as unknown as SubagentRun;
const question = {
  id: 'q1',
  kind: 'question',
  status: 'pending',
  title: 'Which region?',
  prompt: 'Which region should I fetch?',
  created_at: '2026-01-01T11:01:00Z',
  source: { tool_name: 'ask_user' },
} as unknown as PendingInteraction;

function source(fields: Partial<WorkbenchActivitySource> = {}): WorkbenchActivitySource {
  return {
    sessionId: 'session_parent',
    tools,
    processes: [download],
    subagents: [subagent],
    runs,
    tasks: [],
    interactions: [question],
    diffs: [diff],
    artifacts: [],
    resources: [],
    onCancelTask: vi.fn().mockResolvedValue(undefined),
    ...fields,
  };
}

/** The conversation timeline as the Activity tab hosts it: under the host's header. */
function TimelineView() {
  const control = useContext(ObservabilityViewControl);
  return (
    <>
      {control?.renderHeader?.(null)}
      <p>Timeline view</p>
    </>
  );
}

function mount(
  activity = source(),
  answer = { openQuestion: vi.fn(), startAnswer: vi.fn(), stopAnswer: vi.fn() },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onOpenSubagent = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <QuestionAnswerContext.Provider value={answer}>
        <WorkbenchActivityProvider source={activity}>
          <ClioWorkbench
            artifacts={[]}
            diffs={[diff]}
            files={[]}
            onOpenSubagent={onOpenSubagent}
            onUndoDiff={vi.fn()}
            sessionId="session_parent"
            sessionView={<TimelineView />}
            workspaceId="workspace_1"
          />
        </WorkbenchActivityProvider>
      </QuestionAnswerContext.Provider>
    </QueryClientProvider>,
  );
  return { activity, answer, onOpenSubagent };
}

async function openActivity() {
  const user = userEvent.setup();
  // An empty pocket opens on Files; the lit Activity icon again would leave Activity.
  const button = within(screen.getByRole('toolbar', { name: 'Workbench lists' })).getByRole(
    'button',
    { name: 'Activity' },
  );
  if (button.getAttribute('aria-pressed') !== 'true') await user.click(button);
  const list = screen.getByRole('region', { name: 'Activity list' });
  // Activity leads with the causal timeline; every event as a flat list is its Events view.
  if (within(list).queryByText('Timeline view')) {
    await user.click(within(list).getByRole('button', { name: 'Activity views' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Events' }));
  }
  return { user, list: screen.getByRole('region', { name: 'Activity list' }) };
}

describe('Workbench Activity', () => {
  it('leads with the causal timeline, the flat event list one view away', async () => {
    mount();
    await userEvent.click(
      within(screen.getByRole('toolbar', { name: 'Workbench lists' })).getByRole('button', {
        name: 'Activity',
      }),
    );
    const list = screen.getByRole('region', { name: 'Activity list' });
    expect(within(list).getByText('Timeline view')).toBeVisible();
    expect(within(list).queryByRole('listitem')).toBeNull();
    await openActivity();
    expect(within(list).queryByText('Timeline view')).toBeNull();
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('groups what ran into Now, This turn and Earlier with a fixed trailing column', async () => {
    mount();
    const { list } = await openActivity();
    const groups = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent)
      .filter((text) => ['Now', 'This turn', 'Earlier'].includes(text ?? ''));
    expect(groups).toEqual(['Now', 'This turn', 'Earlier']);
    expect(
      within(list).getByRole('button', { name: 'Downloading SMAP L3, running' }),
    ).toHaveTextContent('62%');
    expect(within(list).getByRole('button', { name: /^Which region\?/ })).toHaveTextContent(
      'needs you',
    );
    expect(within(list).getByRole('button', { name: /^ndp_fetch|^Fetch/ })).toHaveTextContent(
      '40ms',
    );
    expect(within(list).getByRole('button', { name: /^Turn 1/ })).toHaveTextContent('1 step');
    expect(within(list).getByRole('button', { name: /regrid_stations\.py/ })).toHaveTextContent(
      '+2 \u22121',
    );
    // Running state is spoken in the row name, not only drawn as a spinner.
    expect(
      within(list).getByRole('button', { name: 'Survey soil sensors, running' }),
    ).toHaveTextContent('subagent');
  });

  it('opens a file change in its diff tab and a read file in its file tab', async () => {
    repository.readWorkspaceFile.mockResolvedValue('site,lat\n');
    mount();
    const { user, list } = await openActivity();
    const change = within(list).getByRole('button', { name: /regrid_stations\.py/ });
    await user.click(change);
    expect(screen.getByRole('tab', { name: /^regrid_stations\.py/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Back on the Activity tab, the row it came from is the current one.
    const back = await openActivity();
    expect(within(back.list).getByRole('button', { name: /regrid_stations\.py/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(within(back.list).getByRole('button', { name: /soil_sites\.csv/ }));
    expect(screen.getByRole('tab', { name: /^soil_sites\.csv/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens a tool call as a detail tab with its input, output and who ran it', async () => {
    mount();
    const { user, list } = await openActivity();
    const row = within(list).getByRole('button', { name: /^ndp_fetch|^Fetch/ });
    await user.click(row);
    expect(screen.getByRole('tab', { name: 'ndp_fetch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Input' })).toHaveTextContent('"dataset": "smap_l3"');
    expect(screen.getByRole('region', { name: 'Output' })).toHaveTextContent('rows: 12');
    const ranBy = screen.getByRole('region', { name: 'Ran by' });
    expect(ranBy).toHaveTextContent('Ran without asking');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  it('stops a running task from its detail tab', async () => {
    const { activity } = mount();
    const { user, list } = await openActivity();
    await user.click(within(list).getByRole('button', { name: 'Downloading SMAP L3, running' }));
    expect(screen.getByRole('tab', { name: 'Downloading SMAP L3' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(activity.onCancelTask).toHaveBeenCalledWith(download);
  });

  it('answers an open question from its detail tab', async () => {
    const { answer } = mount();
    const { user, list } = await openActivity();
    await user.click(within(list).getByRole('button', { name: /^Which region\?/ }));
    expect(screen.getAllByText('Which region should I fetch?').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Read and answer question 1' }));
    expect(answer.openQuestion).toHaveBeenCalledWith(question);
  });

  it('opens a child agent in its own tab', async () => {
    mount();
    const { user, list } = await openActivity();
    await user.click(within(list).getByRole('button', { name: /^Survey soil sensors/ }));
    expect(screen.getByRole('tab', { name: /Survey soil sensors/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('searches and filters by kind', async () => {
    mount();
    const { user, list } = await openActivity();
    await user.click(within(list).getByRole('button', { name: 'Search activity' }));
    await user.type(within(list).getByRole('textbox', { name: 'Search activity' }), 'soil');
    expect(within(list).getByRole('button', { name: /soil_sites\.csv/ })).toBeVisible();
    expect(within(list).queryByRole('button', { name: /regrid_stations/ })).toBeNull();
    await user.keyboard('{Escape}');
    expect(within(list).getByRole('button', { name: /regrid_stations/ })).toBeVisible();

    await user.click(within(list).getByRole('button', { name: 'Filter activity' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Files' }));
    await user.keyboard('{Escape}');
    expect(within(list).queryByRole('button', { name: /regrid_stations/ })).toBeNull();
    expect(within(list).getByRole('button', { name: /^Downloading SMAP L3/ })).toBeVisible();
  });

  it('opens the task a "show in work" link asked for', async () => {
    mount();
    await openActivity();
    act(() => useWorkTaskFocus.getState().focus('task_1'));
    expect(await screen.findByRole('tab', { name: 'Downloading SMAP L3' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(useWorkTaskFocus.getState().handle).toBeUndefined();
  });

  it('shows one empty state before anything ran', async () => {
    mount(
      source({
        tools: [],
        processes: [],
        subagents: [],
        runs: [],
        interactions: [],
        diffs: [],
      }),
    );
    const { list } = await openActivity();
    expect(within(list).getByText('Nothing has run yet')).toBeVisible();
    expect(within(list).queryByText('Now')).toBeNull();
  });
});
