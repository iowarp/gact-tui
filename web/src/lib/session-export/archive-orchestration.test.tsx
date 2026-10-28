import {
  ClioRepository,
  captureSessionReview,
  type ClioTransport,
  type SessionReviewSnapshot,
  type TransportRequest,
  TransportError,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas and reports no intersections: the chart falls back to
// Vega's SVG renderer and flow cards render as if on screen.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
  const measure = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute('data-slot') === 'a2ui-chart-view') return new DOMRect(0, 0, 640, 320);
    return measure.call(this);
  };
});
vi.mock('@/hooks/use-near-viewport', () => ({ useNearViewport: () => true }));
// The railroad draws in a browser; its text alternative and one button per node stand in.
vi.mock('@/components/clio/flow-diagram', () => ({
  FlowDiagram: ({
    spec,
    onSelect,
  }: {
    spec: { kind: string; label: string; railroad?: { marks: { key: string; title: string }[] } };
    onSelect?: (key: string) => void;
  }) => (
    <figure>
      <div aria-label={spec.label} data-kind={spec.kind} role="img" />
      {spec.railroad?.marks.map((mark) => (
        <button
          aria-label={mark.title}
          key={mark.key}
          onClick={() => onSelect?.(mark.key)}
          type="button"
        />
      ))}
    </figure>
  ),
}));

import '@/components/ai-elements/markdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArchiveConnectionProvider } from '@/providers/connection-provider';
import { RepositoryOverrideProvider } from '@/providers/repository-override';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import {
  MEASUREMENTS,
  measurementsTable,
  readingsSurface,
} from '@/test-fixtures/study-view/study-view-fixtures';
import { ArchiveConversation, type ArchiveTranscriptView } from './archive-conversation';
import { ArchiveScienceLog, ArchiveSessionHeader } from './archive-orchestration';
import type { ArchiveTarget } from './archive-orchestration-model';
import { ArchiveTransport } from './archive-transport';

const at = (minute: number) => `2026-10-27T10:${String(minute).padStart(2, '0')}:00Z`;

function session(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: 'ws_1',
    title,
    state: 'completed',
    created_at: at(0),
    updated_at: at(9),
    provider_id: 'local',
    model_id: 'model-a',
    ...extra,
  };
}

function agentTask(handle: string, child: string, expert = 'clio/standard') {
  return {
    task_id: handle,
    parent_session_id: 'sess_root',
    child_session_id: child,
    agent_ref: { expert_id: expert },
    status: 'completed',
    created_at: at(1),
    updated_at: at(3),
  };
}

/** A workflow whose draft step was forked by the agent, then reviewed. */
const workflowRun = {
  run_id: 'flowrun_t',
  flow: 'workflow',
  status: 'completed',
  root_handle: 'task_wf',
  view: {
    kind: 'workflow',
    steps: [
      {
        id: 'draft',
        target: 'self',
        input: 'Draft the summary.',
        status: 'completed',
        handle: 'task_draft',
      },
      {
        id: 'draft~1',
        target: 'self',
        status: 'completed',
        handle: 'task_fork',
        fork_of: 'draft',
        note: 'try a shorter draft',
      },
      {
        id: 'review',
        target: 'self',
        after: ['draft'],
        status: 'completed',
        handle: 'task_review',
      },
    ],
    editors: ['review'],
    approve_edits: true,
  },
  // The reviewer proposed a step past the bound; the run rejected it with its reason.
  events: [
    { event: 'step_completed', step: 'draft', handle: 'task_draft' },
    {
      event: 'step_rejected',
      step: 'extra',
      target: 'self',
      after: ['review'],
      by: 'review',
      reason: 'max_added_reached',
    },
  ],
  calls: [
    { invocation: 'i1', kind: 'agent', handle: 'task_draft', status: 'completed' },
    { invocation: 'i2', kind: 'agent', handle: 'task_fork', status: 'completed' },
    { invocation: 'i3', kind: 'agent', handle: 'task_review', status: 'completed' },
  ],
  timings: {
    task_draft: { created_at: at(1), updated_at: at(3), terminal_at: at(3) },
    task_fork: { created_at: at(2), updated_at: at(4), terminal_at: at(4) },
    task_review: { created_at: at(4), updated_at: at(5), terminal_at: at(5) },
  },
};

/** The fork's approval, asked in the draft step and answered by the person. */
const forkQuestion = {
  id: 'question:task_q1',
  kind: 'question',
  owner_session_id: 'sess_draft',
  attended_session_id: 'sess_root',
  task_id: 'task_q1',
  status: 'answered',
  title: 'Question',
  prompt: "Fork step 'draft' as 'draft~1': try a shorter draft. Allow?",
  answered_by: 'human',
  source: { protocol: 'native', tool_name: 'fork' },
  created_at: at(2),
  payload: {
    question_kind: 'choice',
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    selected_options: ['yes'],
    metadata: { workflow_run: 'flowrun_t', step: 'draft' },
  },
};

/** What a cited call ran, where, and the files it read and wrote. */
function transform(callId: string, extra: Record<string, unknown> = {}) {
  return {
    transform: {
      call_id: callId,
      session_id: 'sess_helper',
      status: 'success',
      instrument: { tool: 'python', args: {}, cmd: '', script_hash: '', script_artifact_id: '' },
      environment: { tier: 'lockfile-hash', clio_version: '0.9.5', python_version: '3.14.6' },
      used: [],
      generated: [],
      ...extra,
    },
  };
}

const study = {
  in_study: true,
  study: 'e_000000000001',
  root_session_id: 'sess_root',
  branches: [
    { session_id: 'sess_root', title: 'Pendulum study', relation: 'root' },
    {
      session_id: 'sess_helper',
      title: 'Arm sweep',
      relation: 'delegated',
      parent_session_id: 'sess_root',
      handle: 'task_helper',
      task_status: 'completed',
      node_folder: '/work/run/helper',
    },
  ],
  entries: [
    {
      id: 'e_000000000001',
      study: 'e_000000000001',
      branch: 'sess_root',
      session: 'sess_root',
      type: 'question',
      fields: { statement: 'What sets the period?' },
      links: [],
      created_at: at(0),
      invocation: 'call_question',
    },
    {
      id: 'e_000000000002',
      study: 'e_000000000001',
      branch: 'sess_helper',
      session: 'sess_helper',
      type: 'observation',
      fields: {
        statement: 'The period grows with the arm length.',
        lineage: [
          {
            call_id: 'call_measure',
            tool: 'measure',
            args: { arm_m: 0.5, _clio_task_description: 'runtime note' },
            started_at: at(5),
            completed_at: at(6),
            result_sha256: 'ab'.repeat(32),
            session: 'sess_helper',
          },
        ],
        artifacts: [
          {
            call_id: 'call_measure',
            direction: 'generated',
            artifact_id: 'artifact_readings',
            path: '/work/run/helper/readings.csv',
            sha256: 'cd'.repeat(32),
          },
        ],
      },
      links: [{ relation: 'answers', to: 'e_000000000001' }],
      created_at: at(6),
      invocation: 'call_measure',
    },
    {
      id: 'e_000000000003',
      study: 'e_000000000001',
      branch: 'sess_root',
      session: 'sess_root',
      type: 'conclusion',
      fields: {
        claims: [
          {
            text: 'The period grows as the square root of the arm.',
            cites: ['e_000000000002'],
            analysis_call: 'call:sess_helper/call_fit',
          },
        ],
        confidence: 'medium',
        relation: 'answers',
      },
      links: [{ relation: 'question', to: 'e_000000000001' }],
      created_at: at(8),
      invocation: 'call_conclude',
    },
  ],
  views: [
    {
      entry: 'e_000000000004',
      session_id: 'sess_root',
      surface_id: 'readings',
      title: 'Arm readings',
      purpose: 'Watch the period against the arm length as branches measure.',
      serves: ['e_000000000001'],
      created_at: at(3),
      surface: readingsSurface,
    },
  ],
};

/** The live service the export captures from: every read the export needs. */
function liveService(requests: string[]): ClioTransport {
  const responses: Record<string, unknown> = {
    '/v1/sessions/sess_root': session('sess_root', 'Pendulum study'),
    '/v1/sessions/sess_helper': session('sess_helper', 'Arm sweep', {
      parent_session_id: 'sess_root',
      agent_id: 'reviewer',
      model_id: 'model-b',
    }),
    '/v1/sessions/sess_fork': session('sess_fork', 'Shorter draft', {
      parent_session_id: 'sess_root',
      metadata: {
        fork_origin: {
          session_id: 'sess_root',
          message_id: '',
          message_count: 0,
          created_at: at(2),
          author: { kind: 'agent', agent_id: 'science' },
          invocation: 'call_fork',
          note: 'try a shorter draft',
        },
      },
    }),
    '/v1/sessions/sess_root/science-log': { session_id: 'sess_root', ...study },
    '/v1/sessions/sess_root/async-processes?include_descendants=false': {
      processes: [
        { id: 'task_wf', handle: 'task_wf', task_kind: 'Subagent', flow: { id: 'workflow' } },
        { id: 'task_helper', handle: 'task_helper', task_kind: 'Subagent', flow: null },
      ],
      cursor: null,
    },
    '/v1/sessions/sess_root/tasks/task_wf/flow': workflowRun,
    '/v1/agent-tasks/task_wf': agentTask('task_wf', 'sess_wf'),
    '/v1/agent-tasks/task_draft': agentTask('task_draft', 'sess_draft'),
    '/v1/agent-tasks/task_fork': agentTask('task_fork', 'sess_fork'),
    '/v1/agent-tasks/task_review': agentTask('task_review', 'sess_review'),
    '/v1/sessions/sess_root/interactions?include_children=true&include_recent_resolved=true&resolved_limit=100':
      { interactions: [forkQuestion] },
    '/v1/transforms/call_measure': transform('call_measure'),
    '/v1/transforms/call_fit': transform('call_fit', {
      instrument: {
        tool: 'python',
        args: {},
        cmd: 'python fit.py',
        script_hash: 'ef'.repeat(32),
        script_artifact_id: '',
      },
      used: [
        {
          role: 'used',
          artifact_id: 'artifact_readings',
          sha256: 'cd'.repeat(32),
          path: '/work/run/helper/readings.csv',
        },
      ],
    }),
  };
  return {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      requests.push(request.path);
      const path = request.path;
      if (path in responses) return request.decode(responses[path]);
      if (path === '/v1/studies/e_000000000001/table-query') {
        expect((request.body as { source?: string }).source).toBe('measurements');
        return request.decode(measurementsTable);
      }
      if (path.endsWith('/a2ui/catalogs'))
        return request.decode({ catalogs: [CLIO_WORKSPACE_CATALOG_ROW] });
      if (path.endsWith('/a2ui/capabilities'))
        return request.decode({
          agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
        });
      if (path === '/v1/sessions/sess_root/a2ui/surfaces')
        return request.decode({ surfaces: [readingsSurface] });
      if (path.endsWith('/a2ui/surfaces')) return request.decode({ surfaces: [] });
      if (path.includes('/interactions?')) return request.decode({ interactions: [] });
      if (path.includes('/async-processes?')) return request.decode({ processes: [] });
      if (path.endsWith('/work?cursor=0')) return request.decode({ todos: [] });
      throw new TransportError(`No route for ${path}`, 404, 'not_found');
    },
    async *stream() {
      yield* [];
    },
  };
}

const message = (id: string, sessionId: string, minute: number, blocks: unknown[]) => ({
  id,
  session_id: sessionId,
  role: 'assistant',
  created_at: at(minute),
  blocks,
});

const views: Record<string, ArchiveTranscriptView> = {
  sess_root: {
    messages: [
      message('m_root', 'sess_root', 1, [
        { id: 'b_text', type: 'text', text: 'Start the workflow and a helper.' },
        { id: 'b_wf', type: 'tool', tool_id: 'call_wf' },
        { id: 'b_spawn', type: 'tool', tool_id: 'call_spawn' },
      ]),
    ],
    tools: [
      {
        id: 'call_wf',
        session_id: 'sess_root',
        name: 'run_workflow',
        state: 'succeeded',
        input: { workflow: { steps: [] }, task: 'Draft and review the summary.' },
        output: { accepted: true, handle: 'task_wf' },
      },
      {
        id: 'call_spawn',
        session_id: 'sess_root',
        name: 'spawn_agent_task',
        state: 'succeeded',
        input: { task: 'Sweep the arm length.' },
        output: { task_id: 'task_helper' },
      },
    ],
    tasks: [],
    subagents: [
      {
        id: 'task_helper',
        session_id: 'sess_root',
        child_session_id: 'sess_helper',
        agent_id: 'reviewer',
        title: 'Arm sweep',
        state: 'completed',
        task: 'Sweep the arm length.',
        result: 'The period grows with the arm length.',
      },
    ],
    artifacts: [],
    surfaces: [],
  },
  sess_helper: {
    messages: [
      message('m_measure', 'sess_helper', 6, [
        { id: 'b_measure', type: 'tool', tool_id: 'call_measure' },
      ]),
      message('m_fit', 'sess_helper', 7, [{ id: 'b_fit', type: 'tool', tool_id: 'call_fit' }]),
    ],
    tools: [
      {
        id: 'call_measure',
        session_id: 'sess_helper',
        name: 'measure',
        state: 'succeeded',
        output: { period_s: 1.9 },
      },
      {
        id: 'call_fit',
        session_id: 'sess_helper',
        name: 'python',
        state: 'succeeded',
        output: { exponent: 0.5 },
      },
    ],
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
  },
};

async function exportArchive(): Promise<{ snapshot: SessionReviewSnapshot; requests: string[] }> {
  const requests: string[] = [];
  const snapshot = await captureSessionReview(liveService(requests), [
    'sess_root',
    'sess_helper',
    'sess_fork',
  ]);
  // The archive is a file: what it carries must survive serialization.
  return { snapshot: JSON.parse(JSON.stringify(snapshot)), requests };
}

function offline(snapshot: SessionReviewSnapshot, children: ReactNode) {
  const repository = new ClioRepository(new ArchiveTransport(snapshot, { views }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArchiveConnectionProvider>
        <RepositoryOverrideProvider repository={repository}>
          <TooltipProvider>{children}</TooltipProvider>
        </RepositoryOverrideProvider>
      </ArchiveConnectionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('exported orchestration', () => {
  it('captures each session, its task rows, flow runs, step tasks and its study once', async () => {
    const { snapshot } = await exportArchive();
    const keys = Object.keys(snapshot.responses);
    for (const path of [
      '/v1/sessions/sess_root',
      '/v1/sessions/sess_root/work?cursor=0',
      '/v1/sessions/sess_root/tasks/task_wf/flow',
      '/v1/agent-tasks/task_draft',
      '/v1/agent-tasks/task_fork',
      '/v1/agent-tasks/task_review',
      '/v1/sessions/sess_helper',
      '/v1/sessions/sess_fork',
      // The questions the run asked, and the record of every call the study cites.
      '/v1/sessions/sess_root/interactions?include_children=true&include_recent_resolved=true&resolved_limit=100',
      '/v1/transforms/call_measure',
      '/v1/transforms/call_fit',
    ])
      expect(keys).toContain(`GET ${path}`);
    // The study is stored under its root; its branch reads answer from that copy.
    expect(snapshot.responses['GET /v1/sessions/sess_helper/science-log']).toEqual({
      same_as: 'GET /v1/sessions/sess_root/science-log',
    });
    // No transcript is captured twice: message reads are answered from the archive's own.
    expect(keys.some((key) => key.endsWith('/messages'))).toBe(false);
    expect(snapshot.failures).toEqual([]);

    const repository = new ClioRepository(new ArchiveTransport(snapshot, { views }));
    expect((await repository.taskFlow('sess_root', 'task_wf'))?.view?.steps).toHaveLength(3);
    expect((await repository.agentTask('task_fork')).child_session_id).toBe('sess_fork');
    const branchStudy = await repository.scienceLog('sess_helper');
    expect(branchStudy.in_study && branchStudy.entries).toHaveLength(3);
    expect((await repository.transformRecord('call_fit')).instrument.script_hash).toBe(
      'ef'.repeat(32),
    );
    expect(await repository.flowQuestions('sess_root')).toHaveLength(1);
    // A view's live source is captured as it stood, and answered from the archive.
    expect(snapshot.tables[MEASUREMENTS]).toMatchObject({ totalRows: 2, truncated: false });
    const archived = await repository.studyTableQuery('e_000000000001', 'measurements', {
      columns: ['value'],
      limit: 10,
    });
    expect(archived.columns['value']).toEqual([1.4, 1.9]);
    expect((await repository.transcript('sess_helper')).messages[0]!.id).toBe('m_measure');
    expect((await repository.sessionRecord('sess_fork')).parent_session_id).toBe('sess_root');
  });

  it('draws a workflow run with its fork beside its step, each step opening its conversation', async () => {
    const user = userEvent.setup();
    const { snapshot } = await exportArchive();
    const onOpenSubagent = vi.fn();
    offline(
      snapshot,
      <ArchiveConversation
        onOpenArtifact={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenSubagent={onOpenSubagent}
        sessionId="sess_root"
        snapshot={snapshot}
        view={views.sess_root!}
      />,
    );
    expect(await screen.findByText('Workflow run')).toBeVisible();
    expect(await screen.findByText(/3 steps, 3 done/u)).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^draft~1 \(fork of draft\): Completed\./u }),
    ).toHaveAttribute('aria-label', expect.stringContaining('Fork of draft: try a shorter draft'));
    await user.click(screen.getByRole('button', { name: /^draft: Completed\./u }));
    const details = screen.getByRole('region', { name: 'draft: Completed' });
    expect(within(details).getByText('Draft the summary.')).toBeVisible();
    await user.click(within(details).getByRole('button', { name: 'Open draft' }));
    await waitFor(() =>
      expect(onOpenSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ child_session_id: 'sess_draft' }),
        expect.anything(),
      ),
    );
  });

  it('links a subagent spawn to its conversation and back, with its agent, model, assignment and result', async () => {
    const user = userEvent.setup();
    const { snapshot } = await exportArchive();
    const onOpen = vi.fn<(target: ArchiveTarget) => void>();
    offline(
      snapshot,
      <ArchiveSessionHeader
        onOpen={onOpen}
        parentTitle="Pendulum study"
        parentView={views.sess_root}
        row={{
          session: { id: 'sess_helper', title: 'Arm sweep' },
          relationship: {
            session_id: 'sess_helper',
            parent_session_id: 'sess_root',
            attribution: 'agent_task',
            task_id: 'task_helper',
          },
        }}
      />,
    );
    const header = screen.getByRole('banner', { name: 'How Arm sweep was started' });
    expect(header).toHaveTextContent('Delegated by Pendulum study');
    expect(header).toHaveTextContent('reviewer');
    expect(header).toHaveTextContent('Sweep the arm length.');
    expect(header).toHaveTextContent('The period grows with the arm length.');
    expect(within(header).getByText('Completed')).toBeVisible();
    expect(await within(header).findByText('local / model-b')).toBeVisible();
    await user.click(within(header).getByRole('button', { name: 'Pendulum study' }));
    expect(onOpen).toHaveBeenCalledWith({ sessionId: 'sess_root', messageId: 'm_root' });
  });

  it("names an agent's fork and its origin", async () => {
    const { snapshot } = await exportArchive();
    offline(
      snapshot,
      <ArchiveSessionHeader
        onOpen={vi.fn()}
        parentTitle="Pendulum study"
        row={{
          session: { id: 'sess_fork', title: 'Shorter draft' },
          relationship: {
            session_id: 'sess_fork',
            parent_session_id: 'sess_root',
            attribution: 'session_fork',
          },
        }}
      />,
    );
    const header = screen.getByRole('banner', { name: 'How Shorter draft was started' });
    expect(header).toHaveTextContent('Forked from Pendulum study');
    expect(
      await within(header).findByText('Forked by the agent: try a shorter draft'),
    ).toBeVisible();
  });

  it('draws the study: its tree and log, its views on request, with citations followable to the transcript', async () => {
    const user = userEvent.setup();
    const { snapshot } = await exportArchive();
    const onOpen = vi.fn<(target: ArchiveTarget) => void>();
    offline(snapshot, <ArchiveScienceLog onOpen={onOpen} sessionId="sess_root" views={views} />);
    const tree = await screen.findByRole('tree', { name: 'Study tree' });
    expect(within(tree).getByText(/What sets the period/u)).toBeVisible();
    // The root's attached view, its chart reading the study's measurements as exported.
    await user.click(await screen.findByRole('radio', { name: 'Views' }));
    const readings = await screen.findByRole('region', { name: 'Arm readings' });
    expect(within(readings).getByText(/Watch the period against the arm length/u)).toBeVisible();
    await waitFor(
      () => expect(readings.querySelector('[data-slot="a2ui-chart-view"]')).not.toBeNull(),
      { timeout: 10_000 },
    );
    await user.click(screen.getByRole('radio', { name: 'List' }));
    const listTree = await screen.findByRole('tree', { name: 'Study tree' });
    await user.click(within(listTree).getAllByRole('button', { name: /Arm sweep/u })[0]!);
    const log = await screen.findByRole('region', { name: 'Log of Arm sweep' });
    await user.click(within(log).getByRole('button', { name: /View in transcript/u }));
    expect(onOpen).toHaveBeenCalledWith({
      sessionId: 'sess_helper',
      messageId: 'm_measure',
      callId: 'call_measure',
    });
  });

  it("shows a workflow's edits and approval questions where they happened, and a step's folder", async () => {
    const user = userEvent.setup();
    const { snapshot } = await exportArchive();
    const onOpenFolder = vi.fn();
    offline(
      snapshot,
      <ArchiveConversation
        folderAvailable={(path) => path === '/work/run/draft~1'}
        // The export's record of each session: the fork step worked in its own folder.
        nodeFolder={(id) => (id === 'sess_fork' ? '/work/run/draft~1' : undefined)}
        onOpenArtifact={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFolder={onOpenFolder}
        sessionId="sess_root"
        snapshot={snapshot}
        view={views.sess_root!}
      />,
    );
    const changes = await screen.findByRole('region', { name: 'Changes while it ran' });
    const edits = within(changes).getByRole('list', { name: 'Edits' });
    expect(edits).toHaveTextContent('extra runs self after review');
    expect(edits).toHaveTextContent('proposed by review');
    expect(edits).toHaveTextContent('not added: the workflow reached its limit of added steps');
    expect(edits).toHaveTextContent('(max_added_reached)');
    const asked = await within(changes).findByRole('list', { name: 'Approval questions' });
    expect(asked).toHaveTextContent('A fork of draft');
    expect(asked).toHaveTextContent("Fork step 'draft' as 'draft~1'");
    expect(asked).toHaveTextContent('You answered: Yes');
    // The step the question was asked in shows it, and the fork shows its folder.
    await user.click(screen.getByRole('button', { name: /^draft: Completed\./u }));
    const draft = screen.getByRole('region', { name: 'draft: Completed' });
    expect(within(draft).getByText(/Approval question/u)).toBeVisible();
    expect(draft).toHaveTextContent('You answered: Yes');
    await user.click(
      screen.getByRole('button', { name: /^draft~1 \(fork of draft\): Completed\./u }),
    );
    const fork = screen.getByRole('region', { name: 'draft~1: Completed' });
    await user.click(
      await within(fork).findByRole('button', { name: 'Open the folder of draft~1' }),
    );
    expect(onOpenFolder).toHaveBeenCalledWith('/work/run/draft~1');
  });

  it("shows each Observation's sources and each claim's analysis, with files linked to the export", async () => {
    const user = userEvent.setup();
    const { snapshot } = await exportArchive();
    const onOpen = vi.fn<(target: ArchiveTarget) => void>();
    const onOpenFolder = vi.fn();
    const inventory = {
      files: [
        {
          archive_path: 'workspace/run/helper/readings.csv',
          source_path: '/work/run/helper/readings.csv',
        },
      ],
      artifacts: [
        {
          artifact_id: 'artifact_readings',
          archive_path: 'workspace/run/helper/readings.csv',
          path: '/work/run/helper/readings.csv',
        },
      ],
    };
    offline(
      snapshot,
      <ArchiveScienceLog
        inventory={inventory}
        onOpen={onOpen}
        onOpenFolder={onOpenFolder}
        sessionId="sess_root"
        views={views}
      />,
    );
    const tree = await screen.findByRole('tree', { name: 'Study tree' });
    // The helper branch's folder, as a path linked to the files the export includes.
    await user.click(within(tree).getByRole('button', { name: 'Open the folder of Arm sweep' }));
    expect(onOpenFolder).toHaveBeenCalledWith('/work/run/helper');

    // The claim's analysis: its script, input file (linked) and environment.
    const conclusion = screen.getByRole('listitem', { name: /^Conclusion:/u });
    await user.click(within(conclusion).getByText('call_fit'));
    expect(await within(conclusion).findByText(/lockfile-hash/u)).toBeVisible();
    expect(conclusion).toHaveTextContent(`sha256 ${'ef'.repeat(32)}`);
    expect(
      within(conclusion).getByRole('link', { name: '/work/run/helper/readings.csv' }),
    ).toHaveAttribute('href', 'workspace/run/helper/readings.csv');
    await user.click(
      within(conclusion).getByRole('button', { name: 'View call call_fit in transcript' }),
    );
    expect(onOpen).toHaveBeenLastCalledWith({
      sessionId: 'sess_helper',
      messageId: 'm_fit',
      callId: 'call_fit',
    });

    // The observation's sources: tool, arguments, result hash, session, and its file.
    await user.click(within(tree).getAllByRole('button', { name: /Arm sweep/u })[0]!);
    const log = await screen.findByRole('region', { name: 'Log of Arm sweep' });
    await user.click(within(log).getByText('Sources (1)'));
    const source = log.querySelector('[data-slot="science-source"]') as HTMLElement;
    expect(source).toHaveTextContent('measure');
    expect(source).toHaveTextContent('{"arm_m":0.5}');
    expect(source).not.toHaveTextContent('runtime note');
    expect(source).toHaveTextContent(`sha256 ${'ab'.repeat(32)}`);
    expect(source).toHaveTextContent('Called in: Arm sweep');
    expect(
      within(source).getByRole('link', { name: '/work/run/helper/readings.csv' }),
    ).toBeVisible();
    expect(await within(source).findByText(/lockfile-hash/u)).toBeVisible();
    await user.click(
      within(source).getByRole('button', { name: 'View call call_measure in transcript' }),
    );
    expect(onOpen).toHaveBeenLastCalledWith({
      sessionId: 'sess_helper',
      messageId: 'm_measure',
      callId: 'call_measure',
    });
  });
});
