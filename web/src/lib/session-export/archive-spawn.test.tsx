import { ClioRepository, type SessionReviewSnapshot } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArchiveConnectionProvider } from '@/providers/connection-provider';
import { RepositoryOverrideProvider } from '@/providers/repository-override';
import { ArchiveConversation, type ArchiveTranscriptView } from './archive-conversation';
import { ArchiveSessionHeader } from './archive-orchestration';
import {
  archiveFinalAnswer,
  archiveSessionOrder,
  archiveSpawnCalls,
  type ArchiveTarget,
} from './archive-orchestration-model';
import { ArchiveTransport } from './archive-transport';

afterEach(cleanup);
beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

const at = (second: number) => `2026-10-27T09:46:${String(second).padStart(2, '0')}Z`;

/** A link presented by a spawn call, as the service records one. */
function subjectBlock(type: 'link' | 'text', label: string, uri = '') {
  return {
    id: 'task-0-identity',
    type,
    label,
    target: type === 'link' ? 'session' : undefined,
    uri,
  };
}

function view(
  sessionId: string,
  tools: unknown[],
  answer: string,
  interactions: unknown[] = [],
): ArchiveTranscriptView {
  return {
    messages: [
      {
        id: `m_${sessionId}`,
        session_id: sessionId,
        role: 'assistant',
        created_at: at(0),
        blocks: [
          ...tools.map((tool) => ({
            id: `b_${(tool as { id: string }).id}`,
            type: 'tool',
            tool_id: (tool as { id: string }).id,
          })),
          { id: `a_${sessionId}`, type: 'text', text: answer, channel: 'answer' },
        ],
      },
    ],
    tools,
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
    interactions,
  };
}

/** Root delegates level 1 on a named model; level 1 forks itself and spawns an explore child. */
const spawnLevel1 = {
  id: 'call_spawn',
  session_id: 'sess_root',
  name: 'spawn_agent_task',
  state: 'succeeded',
  input: { agent: '', task: 'You are level 1.', model: 'local/model-b' },
  output: {
    accepted: true,
    assignment: 'You are level 1.',
    handle: 'task_l1',
    model: {
      asked: 'local/model-b',
      ran: { provider_id: 'local', model_id: 'model-b' },
      source: 'explicit',
    },
    session_id: 'sess_l1',
  },
  presentation: {
    subject: 'task-0-identity',
    summary: '1 task',
    blocks: [subjectBlock('link', 'Subagent', 'sess_l1')],
  },
  started_at: at(1),
  completed_at: at(2),
};
const forkCall = {
  id: 'call_fork',
  session_id: 'sess_l1',
  name: 'fork',
  state: 'succeeded',
  input: { note: 'Reply with the words fork of level 1.' },
  output: {
    fork_of: 'task_l1',
    forked: true,
    handle: 'task_fork',
    label: 'level 1~1',
    note: 'Reply with the words fork of level 1.',
    session_id: 'sess_fork',
  },
  presentation: {
    subject: 'task-0-identity',
    summary: '1 task',
    blocks: [subjectBlock('text', 'level 1~1')],
  },
  started_at: at(10),
  completed_at: at(15),
};
const exploreCall = {
  id: 'call_explore',
  session_id: 'sess_l1',
  name: 'spawn_agents_parallel',
  state: 'succeeded',
  input: { spawns: [{ agent: 'explore', task: 'List the workspace root.' }] },
  output: {
    spawned: [
      {
        accepted: true,
        handle: 'task_explore',
        session_id: 'sess_explore',
        model: { ran: { provider_id: 'local', model_id: 'model-b' }, source: 'inherited' },
      },
    ],
  },
  presentation: {
    subject: 'task-0-identity',
    summary: '1 task',
    blocks: [subjectBlock('link', 'Subagent', 'sess_explore')],
  },
  started_at: at(11),
  completed_at: at(12),
};
/** The fork's approval: it names the asking tool, not its call. */
const forkQuestion = {
  id: 'question:task_q',
  kind: 'question',
  owner_session_id: 'sess_l1',
  attended_session_id: 'sess_root',
  task_id: 'task_q',
  status: 'answered',
  title: 'Question',
  prompt: "Fork 'level 1' as 'level 1~1'? Allow?",
  answered_by: 'human',
  source: { protocol: 'native', tool_name: 'fork' },
  created_at: at(12),
  revision: at(13),
  payload: {
    question_id: 'task_q',
    question_kind: 'choice',
    options: [
      { label: 'Yes', value: 'yes', description: '' },
      { label: 'No', value: 'no', description: '' },
    ],
    allow_freeform: false,
    answer: 'yes',
    selected_options: ['yes'],
  },
  requires_human_response: false,
  actions: [],
};

const views: Record<string, ArchiveTranscriptView> = {
  sess_root: view('sess_root', [spawnLevel1], 'The chain completed.'),
  sess_l1: view('sess_l1', [forkCall, exploreCall], 'Level 1 is done.', [forkQuestion]),
  // The fork's copy of its caller repeats the fork call without its result.
  sess_fork: view(
    'sess_fork',
    [{ ...forkCall, session_id: 'sess_fork', output: '' }],
    'fork of level 1',
  ),
  sess_explore: view('sess_explore', [], 'readme.txt'),
};

function record(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    json: {
      id,
      workspace_id: 'ws_1',
      title,
      state: 'completed',
      created_at: at(0),
      updated_at: at(30),
      provider_id: 'local',
      model_id: 'model-b',
      agent_id: 'standard',
      ...extra,
    },
  };
}

const snapshot: SessionReviewSnapshot = {
  responses: {
    'GET /v1/sessions/sess_l1': record('sess_l1', 'Level 1'),
    'GET /v1/sessions/sess_fork': record('sess_fork', 'level 1~1'),
    'GET /v1/sessions/sess_explore': record('sess_explore', 'explore', { agent_id: 'explore' }),
  },
  sessions: {},
  tables: {},
  failures: [],
};

function offline(children: ReactNode) {
  const repository = new ClioRepository(new ArchiveTransport(snapshot, { views }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ArchiveConnectionProvider>
        <RepositoryOverrideProvider repository={repository}>
          <TooltipProvider>{children}</TooltipProvider>
        </RepositoryOverrideProvider>
      </ArchiveConnectionProvider>
    </QueryClientProvider>,
  );
}

describe('exported subagent tree without subagent records', () => {
  it('finds each child from the call that started it, a fork where it was made', () => {
    const calls = archiveSpawnCalls(views);
    expect(calls.get('sess_l1')).toMatchObject({
      sessionId: 'sess_root',
      callId: 'call_spawn',
      messageId: 'm_sess_root',
      forked: false,
      assignment: 'You are level 1.',
      model: { source: 'explicit' },
    });
    expect(calls.get('sess_fork')).toMatchObject({
      sessionId: 'sess_l1',
      callId: 'call_fork',
      forked: true,
      assignment: 'Reply with the words fork of level 1.',
    });
    expect(calls.get('sess_explore')).toMatchObject({
      sessionId: 'sess_l1',
      agent: 'explore',
      assignment: 'List the workspace root.',
      model: { source: 'inherited' },
    });
    expect(archiveFinalAnswer(views.sess_fork)).toBe('fork of level 1');
    // A flow's run is a child too: its call names the session the flow runs in.
    const flow = archiveSpawnCalls({
      sess_root: view(
        'sess_root',
        [
          {
            id: 'call_flow',
            session_id: 'sess_root',
            name: 'run_flow',
            state: 'succeeded',
            input: { flow: 'council', input: 'Is a hot dog a sandwich?' },
            output: {
              assignment: 'Is a hot dog a sandwich?',
              handle: 'task_c',
              session_id: 'sess_c',
            },
          },
        ],
        'Done.',
      ),
    });
    expect(flow.get('sess_c')).toMatchObject({
      callId: 'call_flow',
      assignment: 'Is a hot dog a sandwich?',
    });
  });

  it('reads each child after the session that started it, siblings in the order they started', () => {
    const row = (id: string, parent?: string, created_at = at(0)) => ({
      session: { id, created_at },
      relationship: parent ? { session_id: id, parent_session_id: parent } : undefined,
    });
    // The service files the fork under whoever waits on it; its call is in level 1.
    const order = archiveSessionOrder(
      [
        row('sess_root'),
        row('sess_explore', 'sess_l1'),
        row('sess_fork', 'sess_root'),
        row('sess_l1', 'sess_root'),
      ],
      archiveSpawnCalls(views),
    );
    expect(order.map((r) => r.session.id)).toEqual([
      'sess_root',
      'sess_l1',
      'sess_fork',
      'sess_explore',
    ]);
  });

  it('heads a child with its agent, model and why, assignment and result, and a way back', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn<(target: ArchiveTarget) => void>();
    const calls = archiveSpawnCalls(views);
    offline(
      <>
        <ArchiveSessionHeader
          call={calls.get('sess_l1')}
          onOpen={onOpen}
          parentTitle="F20 tree"
          row={{
            session: { id: 'sess_l1', title: 'Level 1' },
            relationship: { session_id: 'sess_l1', parent_session_id: 'sess_root' },
          }}
          view={views.sess_l1}
        />
        <ArchiveSessionHeader
          call={calls.get('sess_fork')}
          onOpen={onOpen}
          parentTitle="Level 1"
          row={{
            session: { id: 'sess_fork', title: 'level 1~1' },
            relationship: { session_id: 'sess_fork', parent_session_id: 'sess_root' },
          }}
          view={views.sess_fork}
        />
      </>,
    );
    const header = screen.getByRole('banner', { name: 'How Level 1 was started' });
    expect(header).toHaveTextContent('Delegated by F20 tree — back to where it was started');
    expect(await within(header).findByText('local / model-b (named for this call)')).toBeVisible();
    expect(header).toHaveTextContent('standard');
    expect(header).toHaveTextContent('You are level 1.');
    expect(header).toHaveTextContent('Level 1 is done.');
    expect(within(header).getByText('Completed')).toBeVisible();
    await user.click(within(header).getByRole('button', { name: 'F20 tree' }));
    expect(onOpen).toHaveBeenCalledWith({
      sessionId: 'sess_root',
      messageId: 'm_sess_root',
      callId: 'call_spawn',
    });

    const fork = screen.getByRole('banner', { name: 'How level 1~1 was started' });
    expect(fork).toHaveTextContent('Forked from Level 1');
    expect(await within(fork).findByText('local / model-b')).toBeVisible();
    expect(fork).toHaveTextContent('Fork note');
    expect(fork).toHaveTextContent('Reply with the words fork of level 1.');
    expect(fork).toHaveTextContent('fork of level 1');
  });

  it("heads a flow's step with what it was handed and a way back to the run's railroad", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn<(target: ArchiveTarget) => void>();
    const runCall = {
      sessionId: 'sess_root',
      callId: 'call_wf',
      messageId: 'm_sess_root',
      childSessionId: 'sess_run',
      forked: false,
      flow: 'workflow',
    };
    const step: ArchiveTranscriptView = {
      ...view('sess_step', [], 'Three reasons.'),
      messages: [
        {
          id: 'm_step',
          session_id: 'sess_step',
          role: 'assistant',
          created_at: at(0),
          blocks: [
            { id: 'i', type: 'injection', source: 'delegation', text: 'Give three reasons.' },
            { id: 'a', type: 'text', text: 'Three reasons.', channel: 'answer' },
          ],
        },
      ],
    };
    const repository = new ClioRepository(
      new ArchiveTransport({
        ...snapshot,
        responses: {
          'GET /v1/sessions/sess_step': record('sess_step', 'a'),
          'GET /v1/agent-tasks/task_step': {
            json: {
              task_id: 'task_step',
              child_session_id: 'sess_step',
              parent_session_id: 'sess_run',
              model_choice: {
                ran: { provider_id: 'local', model_id: 'model-b' },
                source: 'inherited',
              },
            },
          },
        },
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ArchiveConnectionProvider>
          <RepositoryOverrideProvider repository={repository}>
            <ArchiveSessionHeader
              flowCall={runCall}
              onOpen={onOpen}
              parentTitle="CLIO"
              row={{
                session: { id: 'sess_step', title: 'a' },
                relationship: {
                  session_id: 'sess_step',
                  parent_session_id: 'sess_run',
                  task_id: 'task_step',
                },
              }}
              view={step}
            />
          </RepositoryOverrideProvider>
        </ArchiveConnectionProvider>
      </QueryClientProvider>,
    );
    const header = screen.getByRole('banner', { name: 'How a was started' });
    expect(header).toHaveTextContent('Delegated by the workflow run — back to where it was drawn');
    expect(header).toHaveTextContent('Give three reasons.');
    expect(header).toHaveTextContent('Three reasons.');
    expect(await within(header).findByText('local / model-b (the caller’s model)')).toBeVisible();
    await user.click(within(header).getByRole('button', { name: 'workflow run' }));
    expect(onOpen).toHaveBeenCalledWith({
      sessionId: 'sess_root',
      messageId: 'm_sess_root',
      callId: 'call_wf',
    });
  });

  it("opens each child from its spawn's link, and shows the fork's approval at its call", async () => {
    const user = userEvent.setup();
    const onOpenSession = vi.fn<(sessionId: string) => void>();
    offline(
      <ArchiveConversation
        onOpenArtifact={() => undefined}
        onOpenFile={() => undefined}
        onOpenSession={onOpenSession}
        sessionAvailable={(id) => id in views}
        sessionId="sess_l1"
        snapshot={snapshot}
        view={views.sess_l1}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Activity:/ }));
    // Collapsed, each call offers its child; expanded, the child's name links to it.
    await user.click(screen.getByRole('button', { name: 'Open level 1~1' }));
    expect(onOpenSession).toHaveBeenLastCalledWith('sess_fork');
    await user.click(screen.getByRole('button', { name: 'Show result for fork' }));
    await user.click(screen.getByRole('button', { name: 'level 1~1' }));
    expect(onOpenSession).toHaveBeenLastCalledWith('sess_fork');
    await user.click(screen.getByRole('button', { name: 'Open Subagent' }));
    expect(onOpenSession).toHaveBeenLastCalledWith('sess_explore');
    // The approval follows the fork call, before the next call.
    const question = screen.getByText("Fork 'level 1' as 'level 1~1'? Allow?");
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(document.getElementById('tool-call_fork')!, question)).toBe(true);
    expect(follows(question, document.getElementById('tool-call_explore')!)).toBe(true);
  });
});
