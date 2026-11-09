import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render as renderBare,
  screen,
  waitFor,
  within,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeScienceEntries } from '@/lib/streaming/science-log-updates';
import { ScienceLogView } from './science-log-tab';
import { ClioWorkbench } from './workbench';
import { saveWorkbenchState, sessionTab } from './workbench-tab-storage';
import { TooltipProvider } from '@/components/ui/tooltip';

const render = (ui: ReactElement, options?: RenderOptions) =>
  renderBare(ui, { wrapper: TooltipProvider, ...options });

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: false }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const hex = (n: number) => n.toString(16).padStart(12, '0');
const id = (n: number) => `e_${hex(n)}`;
const call = (n: number) => `call_${hex(n)}`;

const entry = (
  n: number,
  branch: string,
  type: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  id: id(n),
  study: id(1),
  branch,
  session: branch,
  type,
  fields,
  links: [],
  status: '',
  created_at: `2026-10-27T10:${String(n).padStart(2, '0')}:00Z`,
  invocation: call(n),
  ...extra,
});

/** A study: the root asks, two steps test one hypothesis each, and one step forks. */
const study = scienceLogSchema.parse({
  session_id: 'sess_root',
  in_study: true,
  study: id(1),
  root_session_id: 'sess_root',
  branches: [
    { session_id: 'sess_root', title: 'Decay study', agent: 'clio/science', relation: 'root' },
    {
      session_id: 'sess_h1',
      title: 'Linear trial',
      relation: 'step',
      parent_session_id: 'sess_root',
      workflow_step: 'h1',
      handle: 'task_h1',
      task_status: 'completed',
      node_folder: '/work/study/h1',
    },
    {
      session_id: 'sess_h2',
      title: 'Quadratic trial',
      relation: 'step',
      parent_session_id: 'sess_root',
      workflow_step: 'h2',
      handle: 'task_h2',
      task_status: 'running',
    },
    {
      session_id: 'sess_h2f',
      title: 'Cubic trial',
      relation: 'fork',
      parent_session_id: 'sess_root',
      fork_of_session_id: 'sess_h2',
      workflow_step: 'h2~1',
      handle: 'task_h2f',
      task_status: 'running',
      note: 'pursue the cubic law instead',
    },
  ],
  entries: [
    entry(
      1,
      'sess_root',
      'question',
      { statement: 'Which law governs the decay rate?' },
      { status: 'open' },
    ),
    entry(
      2,
      'sess_root',
      'hypothesis',
      { claim: 'The rate is linear in load', refuting_prediction: 'Curvature above 5%' },
      { status: 'supported', links: [{ relation: 'answers', to: id(1) }] },
    ),
    entry(
      3,
      'sess_root',
      'hypothesis',
      { claim: 'The rate is quadratic in load', refuting_prediction: 'A straight fit' },
      { status: 'refuted', links: [{ relation: 'answers', to: id(1) }] },
    ),
    entry(
      4,
      'sess_h1',
      'experiment',
      { method: 'Sweep the load over five levels' },
      {
        links: [{ relation: 'tests', to: id(2) }],
      },
    ),
    entry(
      5,
      'sess_h1',
      'observation',
      {
        from_calls: [`call:sess_h1/${call(40)}`],
        measurements: [{ metric: 'rate', value: 0.42, unit: '1/s' }],
        lineage: [
          {
            call_id: call(40),
            tool: 'run_trial',
            completed_at: '2026-10-27T10:04:30Z',
            result_sha256: 'abcdef0123456789abcdef',
          },
        ],
      },
      { links: [{ relation: 'observes', to: id(4) }] },
    ),
    entry(
      6,
      'sess_h1',
      'evidence',
      { interpretation: 'A straight fit holds', strength: 'strong' },
      {
        links: [
          { relation: 'interprets', to: id(5) },
          { relation: 'supports', to: id(2) },
        ],
      },
    ),
    entry(7, 'sess_h2f', 'observation', {
      measurements: [{ metric: 'rate', value: 0.44, unit: '1/s' }],
      derived_from: id(5),
    }),
    entry(8, 'sess_root', 'conclusion', {
      claims: [{ text: 'The linear law holds', cites: [id(6)] }],
      confidence: 'high',
      caveats: 'Five load levels only',
      relation: 'answers',
    }),
  ],
}) as ScienceStudy;

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderWorkbench(inStudy: boolean | undefined) {
  return render(
    <ClioWorkbench
      artifacts={[]}
      diffs={[]}
      files={[]}
      inStudy={inStudy}
      onOpenSubagent={vi.fn()}
      onUndoDiff={vi.fn()}
      sessionId="sess_root"
      sessionView={<p>Session intelligence</p>}
      workspaceId="workspace_1"
    />,
    { wrapper },
  );
}

describe('Science log tab', () => {
  it('is absent when the session is in no study and present beside the others when it is', async () => {
    const restoreTimeline = () =>
      saveWorkbenchState('workspace_1', {
        tabs: [sessionTab],
        activeTabId: sessionTab.id,
        listView: 'files',
        pinnedIds: [],
      });
    restoreTimeline();
    const { unmount } = renderWorkbench(false);
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Science log' })).not.toBeInTheDocument();
    unmount();
    window.localStorage.clear();

    restoreTimeline();
    renderWorkbench(true);
    expect(await screen.findByRole('tab', { name: 'Science log' })).toBeVisible();
    // Offered beside the others, without taking focus from the open tab.
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers no Views tab of its own: a view is a dashboard attached to a study', () => {
    renderWorkbench(false);
    expect(screen.queryByRole('tab', { name: 'Views' })).not.toBeInTheDocument();
  });

  it('frames the log with its count and two modes, the log and the study graph', () => {
    render(<ScienceLogView sessionId="sess_root" study={study} views={<p>Live boards</p>} />);
    const frame = screen.getByRole('toolbar', { name: 'Science log' });
    expect(within(frame).getByText('8 entries')).toHaveAttribute('data-frame-position');
    expect(within(frame).getByRole('tab', { name: 'Log' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(frame).getByRole('tab', { name: 'Study graph' })).toBeVisible();
    expect(within(frame).queryByRole('tab', { name: 'Views' })).toBeNull();
    expect(screen.queryByText('Live boards')).toBeNull();
  });

  it('lists the study beside the log, each topic with its state in text and its count', () => {
    render(<ScienceLogView sessionId="sess_root" study={study} />);
    const tree = screen.getByRole('group', { name: 'Study tree' });
    expect(
      within(tree).getByRole('button', { name: 'Study: Decay study, 8 entries' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(tree).getByRole('button', {
        name: /^Hypothesis: The rate is linear in load, supported, \d+ entries$/u,
      }),
    ).toBeVisible();
    expect(
      within(tree).getByRole('button', {
        name: /^Hypothesis: The rate is quadratic in load, refuted/u,
      }),
    ).toBeVisible();
    expect(
      within(tree).getByRole('button', { name: 'Step: Linear trial, completed, 3 entries' }),
    ).toBeVisible();
    const quadratic = within(tree).getByRole('button', { name: 'Step: Quadratic trial, running' });
    expect(quadratic).toBeVisible();
    // A third level opens under its picked topic.
    expect(quadratic).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByRole('button', { name: /^Fork: Cubic trial/u })).toBeNull();
    fireEvent.click(quadratic);
    expect(quadratic).toHaveAttribute('aria-expanded', 'true');
    // The fork says what it forks, its note and what it derives from on hover.
    const fork = within(tree).getByRole('button', { name: 'Fork: Cubic trial, running, 1 entry' });
    const hover = fork.closest('[role="listitem"]')!.getAttribute('title');
    expect(hover).toContain('fork of Quadratic trial');
    expect(hover).toContain('Note: pursue the cubic law instead');
    expect(hover).toContain('Derived from Linear trial');
  });

  it('narrows the log to a picked topic and opens its task and folder', async () => {
    const user = userEvent.setup();
    const onOpenFolder = vi.fn();
    const onOpenTask = vi.fn();
    render(
      <ScienceLogView
        onOpenFolder={onOpenFolder}
        onOpenTask={onOpenTask}
        sessionId="sess_root"
        study={study}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Step: Linear trial/u }));
    const frame = screen.getByRole('toolbar', { name: 'Science log' });
    expect(within(frame).getByText('3 entries')).toBeVisible();
    expect(within(frame).getByText('Linear trial')).toBeVisible();
    const log = screen.getByRole('list', { name: 'Science log entries' });
    expect(within(log).getAllByRole('listitem')).toHaveLength(3);
    expect(within(log).getByText('Sweep the load over five levels')).toBeVisible();
    await user.click(within(frame).getByRole('button', { name: 'Open task' }));
    expect(onOpenTask).toHaveBeenCalledWith('task_h1');
    await user.click(within(frame).getByRole('button', { name: 'Open options' }));
    await user.click(await screen.findByRole('menuitem', { name: /Open folder/u }));
    expect(onOpenFolder).toHaveBeenCalledWith('/work/study/h1');
    // The crumb back to the whole log.
    await user.click(within(frame).getByRole('button', { name: 'Science log' }));
    expect(within(frame).getByText('8 entries')).toBeVisible();
  });

  it('opens an entry in place with its facts, its cited run and who cites it', async () => {
    const user = userEvent.setup();
    const onViewCall = vi.fn();
    render(<ScienceLogView onViewCall={onViewCall} sessionId="sess_h1" study={study} />);
    const observation = screen.getByRole('listitem', { name: 'Observation: 1 measurement' });
    const row = within(observation).getByRole('button', { name: /Observation: 1 measurement/u });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(observation).toHaveAttribute('data-focused', 'true');
    expect(observation).toHaveTextContent('Metricrate');
    expect(observation).toHaveTextContent('Value0.42 1/s');
    expect(observation).toHaveTextContent('Cited by');
    expect(within(observation).getByText('interprets')).toBeVisible();
    await user.click(within(observation).getByRole('button', { name: /^run_trial run/u }));
    expect(onViewCall).toHaveBeenCalledWith('sess_h1', call(40));
    // Sources stay collapsed until asked for.
    const sources = within(observation).getByText('Sources (1)').closest('details')!;
    expect(sources).not.toHaveAttribute('open');
    expect(sources).toHaveTextContent('run_trial');
    expect(sources).toHaveTextContent('abcdef012345');
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  it('jumps from a citation to the cited entry in another branch', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_root" study={study} />);
    const conclusion = screen.getByRole('listitem', { name: 'Conclusion: The linear law holds' });
    await user.click(within(conclusion).getByRole('button', { name: /^Conclusion/u }));
    await user.click(
      within(conclusion).getByRole('button', { name: /Evidence: A straight fit holds/u }),
    );
    const cited = screen.getByRole('listitem', { name: 'Evidence: A straight fit holds' });
    await waitFor(() => expect(cited).toHaveAttribute('data-focused', 'true'));
  });

  it('widens a narrowed log to follow a backlink outside it', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_h1" study={study} />);
    const frame = screen.getByRole('toolbar', { name: 'Science log' });
    expect(within(frame).getByText('3 entries')).toBeVisible();
    const evidence = screen.getByRole('listitem', { name: 'Evidence: A straight fit holds' });
    await user.click(within(evidence).getByRole('button', { name: /^Evidence/u }));
    // The conclusion in the root branch cites this evidence.
    await user.click(
      within(evidence).getByRole('button', { name: /Conclusion: The linear law holds/u }),
    );
    expect(within(frame).getByText('8 entries')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('listitem', { name: 'Conclusion: The linear law holds' }),
      ).toHaveAttribute('data-focused', 'true'),
    );
  });

  it('merges a live entry into the read and defers one from an unknown branch', () => {
    const live = { ...study.entries[1]!, id: id(9), status: 'open' };
    const merged = mergeScienceEntries(study, [live]);
    expect(merged?.in_study && merged.entries.at(-1)?.id).toBe(id(9));
    expect(mergeScienceEntries(study, [{ ...live, branch: 'sess_new' }])).toBeUndefined();
    expect(mergeScienceEntries({ session_id: 's', in_study: false }, [live])).toBeUndefined();
  });
});
