import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeScienceEntries } from '@/lib/streaming/science-log-updates';
import { ScienceLogView } from './science-log-tab';
import { ClioWorkbench } from './workbench';

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
    const { unmount } = renderWorkbench(false);
    expect(screen.getByRole('tab', { name: 'Observability' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Science log' })).not.toBeInTheDocument();
    unmount();
    window.localStorage.clear();

    renderWorkbench(true);
    expect(await screen.findByRole('tab', { name: 'Science log' })).toBeVisible();
    // Offered beside the others, without taking focus from the open tab.
    expect(screen.getByRole('tab', { name: 'Observability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('offers no Views tab of its own: a view is a dashboard attached to a study', () => {
    renderWorkbench(false);
    expect(screen.queryByRole('tab', { name: 'Views' })).not.toBeInTheDocument();
  });

  it('gives views, the list and the graph the whole tab, one at a time', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_root" study={study} views={<p>Live boards</p>} />);
    expect(screen.getByRole('tree', { name: 'Study tree' })).toBeVisible();
    expect(screen.queryByText('Live boards')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Views' }));
    expect(screen.getByText('Live boards')).toBeVisible();
    expect(screen.queryByRole('tree', { name: 'Study tree' })).toBeNull();
  });

  it('offers no Views choice when the study has none', () => {
    render(<ScienceLogView sessionId="sess_root" study={study} />);
    expect(screen.queryByRole('radio', { name: 'Views' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'List' })).toBeVisible();
  });

  it('draws the study tree with each node state in text, forks labelled', async () => {
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
    const tree = screen.getByRole('tree', { name: 'Study tree' });
    expect(
      within(tree).getByRole('treeitem', {
        name: 'Hypothesis: The rate is linear in load, supported',
      }),
    ).toBeVisible();
    expect(
      within(tree).getByRole('treeitem', {
        name: 'Hypothesis: The rate is quadratic in load, refuted',
      }),
    ).toBeVisible();
    // Each node shows its own status: the question is still open although a
    // hypothesis under it is refuted, and a step shows its task's state.
    expect(
      within(tree).getByRole('treeitem', {
        name: 'Question: Which law governs the decay rate?, open',
      }),
    ).toBeVisible();
    expect(
      within(tree).getByRole('treeitem', { name: 'Step: Linear trial, completed' }),
    ).toBeVisible();
    const quadratic = within(tree).getByRole('treeitem', {
      name: 'Step: Quadratic trial, running',
    });
    // The fork sits under the step it forks, labelled in text, its note in its tooltip.
    const fork = within(quadratic).getByRole('treeitem', { name: 'Fork: Cubic trial, running' });
    expect(fork).toHaveTextContent('fork of Quadratic trial');
    expect(within(fork).getByRole('button', { name: /Fork\s*Cubic trial/u })).toHaveAttribute(
      'title',
      expect.stringContaining('Note: pursue the cubic law instead'),
    );
    expect(fork).toHaveTextContent('Derived from');
    await user.click(within(tree).getByRole('button', { name: 'Open the folder of Linear trial' }));
    expect(onOpenFolder).toHaveBeenCalledWith('/work/study/h1');
    await user.click(within(tree).getByRole('button', { name: 'Open the task of Linear trial' }));
    expect(onOpenTask).toHaveBeenCalledWith('task_h1');
  });

  it('opens a branch log when its node is selected, without leaving the session', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_root" study={study} />);
    expect(screen.getByRole('region', { name: 'Log of Decay study' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Step\s*Linear trial/u }));
    const log = screen.getByRole('region', { name: 'Log of Linear trial' });
    expect(within(log).getByText('Sweep the load over five levels')).toBeVisible();
    expect(within(log).getByRole('table')).toHaveTextContent('rate0.421/s');
    // Sources stay collapsed until asked for.
    const sources = within(log).getByText('Sources (1)').closest('details')!;
    expect(sources).not.toHaveAttribute('open');
    expect(sources).toHaveTextContent('run_trial');
    expect(sources).toHaveTextContent('abcdef012345');
  });

  it('jumps from a citation to the cited entry in another branch', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_root" study={study} />);
    const conclusion = screen.getByRole('listitem', { name: 'Conclusion: The linear law holds' });
    await user.click(
      within(conclusion).getByRole('button', { name: /Evidence: A straight fit holds/u }),
    );
    const log = screen.getByRole('region', { name: 'Log of Linear trial' });
    const cited = within(log).getByRole('listitem', { name: 'Evidence: A straight fit holds' });
    await waitFor(() => expect(cited).toHaveAttribute('data-focused', 'true'));
  });

  it('shows who cites an entry and follows the backlink', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="sess_h1" study={study} />);
    const observation = screen.getByRole('listitem', { name: 'Observation: 1 measurement' });
    expect(observation).toHaveTextContent('Cited by');
    expect(within(observation).getByText('interprets')).toBeVisible();
    const evidence = screen.getByRole('listitem', { name: 'Evidence: A straight fit holds' });
    // The conclusion in the root branch cites this evidence.
    await user.click(
      within(evidence).getByRole('button', { name: /Conclusion: The linear law holds/u }),
    );
    expect(screen.getByRole('region', { name: 'Log of Decay study' })).toBeVisible();
  });

  it('merges a live entry into the read and defers one from an unknown branch', () => {
    const live = { ...study.entries[1]!, id: id(9), status: 'open' };
    const merged = mergeScienceEntries(study, [live]);
    expect(merged?.in_study && merged.entries.at(-1)?.id).toBe(id(9));
    expect(mergeScienceEntries(study, [{ ...live, branch: 'sess_new' }])).toBeUndefined();
    expect(mergeScienceEntries({ session_id: 's', in_study: false }, [live])).toBeUndefined();
  });
});
