import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/components/ai-elements/markdown';
import { ArchiveConnectionProvider } from '@/providers/connection-provider';
import { ArchiveConversation, type ArchiveTranscriptView } from './archive-conversation';

afterEach(cleanup);
beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

it('uses native activity controls with the loaded skill and failed command at their calls', async () => {
  const view: ArchiveTranscriptView = {
    messages: [
      {
        id: 'm',
        session_id: 's',
        role: 'assistant',
        created_at: '2026-10-05T17:45:00Z',
        blocks: [
          { id: 'think', type: 'reasoning', text: 'Inspect workspace' },
          { id: 'skill', type: 'tool', tool_id: 'skill' },
          { id: 'shell', type: 'tool', tool_id: 'shell' },
          { id: 'answer', type: 'text', text: 'Access failed before execution.' },
        ],
      },
    ],
    tools: [
      {
        id: 'skill',
        session_id: 's',
        name: 'load_skill',
        state: 'succeeded',
        input: { skill_id: 'audit' },
        output: '# Recorded audit\nRead the manifest.',
        presentation: {
          action: 'Load skill',
          summary: '',
          blocks: [
            { id: 'content', type: 'markdown', text: '# Recorded audit\nRead the manifest.' },
          ],
        },
      },
      {
        id: 'shell',
        session_id: 's',
        name: 'shell_bash',
        state: 'failed',
        input: { command: 'Get-Location', cwd: 'D:/dataset' },
        error: 'Connected-source access decisions could not be read',
        presentation: {
          action: 'Run',
          summary: '',
          blocks: [{ id: 'terminal', type: 'terminal', command: 'Get-Location' }],
        },
      },
    ],
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ArchiveConnectionProvider>
        <ArchiveConversation
          sessionId="s"
          view={view}
          snapshot={{ responses: {}, sessions: {}, tables: {}, failures: [] }}
          onOpenFile={() => undefined}
          onOpenArtifact={() => undefined}
        />
      </ArchiveConnectionProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Activity:/ }));
  await user.click(screen.getByRole('button', { name: 'Show result for Load skill' }));
  const skillDetails = await screen.findByRole('region', { name: 'Load skill: Result' });
  expect(skillDetails).toHaveTextContent('Recorded audit');
  expect(skillDetails).toHaveTextContent('Read the manifest.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: 'Show result for Load skill' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('region', { name: 'Load skill: Result' })).not.toBeInTheDocument();
  expect(screen.getByText('Get-Location')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Show result for Run' }));
  expect(screen.getByRole('region', { name: 'Run: Result' })).toHaveTextContent(
    'Connected-source access decisions could not be read',
  );
  await user.click(screen.getByRole('button', { name: 'Technical details for Run' }));
  const details = await screen.findByRole('dialog', { name: 'Run: Technical details' });
  expect(within(details).getByText(/D:\/dataset/)).toBeVisible();
  expect(details).toHaveTextContent('Connected-source access decisions could not be read');
});

it('merges captured interactions with authoritative answers at their owning tools', async () => {
  const view: ArchiveTranscriptView = {
    messages: [
      {
        id: 'm',
        session_id: 's',
        role: 'assistant',
        created_at: '2026-10-05T17:45:00Z',
        blocks: [
          { id: 'think', type: 'reasoning', text: 'Clarifying treatment' },
          { id: 'ask', type: 'tool', tool_id: 'ask' },
          { id: 'other', type: 'tool', tool_id: 'other' },
        ],
      },
      {
        id: 'resume',
        session_id: 's',
        role: 'user',
        created_at: '2026-10-05T17:46:00Z',
        metadata: { ask_user_resume: true, ask_user_question_id: 'q' },
        blocks: [{ id: 'envelope', type: 'text', text: 'PRIVATE RESUME ENVELOPE' }],
      },
    ],
    tools: [
      {
        id: 'ask',
        session_id: 's',
        name: 'ask_user',
        state: 'succeeded',
        input: { question: 'Which label is control?' },
        output: 'Question submitted',
      },
      {
        id: 'other',
        session_id: 's',
        name: 'ask_user',
        state: 'succeeded',
        input: { question: 'Which file should be reviewed?' },
        output: 'Question submitted',
      },
    ],
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
    interactions: [
      {
        id: 'question:q',
        kind: 'question',
        owner_session_id: 's',
        attended_session_id: 's',
        status: 'answered',
        title: 'Question from agent',
        prompt: 'Which label is control?',
        source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'ask' },
        created_at: '2026-10-05T17:45:00Z',
        payload: {
          question_id: 'q',
          question_kind: 'freeform',
          answer_metadata: { answer: 'The control mapping is unconfirmed.' },
        },
      },
    ],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ArchiveConnectionProvider>
        <ArchiveConversation
          sessionId="s"
          view={view}
          snapshot={{
            responses: {
              'GET /v1/sessions/s/interactions?include_recent_resolved=true&resolved_limit=100': {
                json: {
                  interactions: [
                    { ...(view.interactions![0] as object), status: 'pending', payload: {} },
                    {
                      id: 'question:other',
                      kind: 'question',
                      owner_session_id: 's',
                      attended_session_id: 's',
                      status: 'answered',
                      title: 'Question from agent',
                      prompt: 'Which file should be reviewed?',
                      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'other' },
                      created_at: '2026-10-05T17:46:00Z',
                      payload: {
                        question_id: 'other',
                        question_kind: 'freeform',
                        answer_metadata: { answer: 'Review the recorded report.' },
                      },
                    },
                  ],
                },
              },
            },
            sessions: {},
            tables: {},
            failures: [],
          }}
          onOpenFile={() => undefined}
          onOpenArtifact={() => undefined}
        />
      </ArchiveConnectionProvider>
    </QueryClientProvider>,
  );
  expect(screen.queryByText('PRIVATE RESUME ENVELOPE')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: /^Activity:/ }));
  expect(await screen.findByText('Which label is control?')).toBeVisible();
  expect(screen.getByText('The control mapping is unconfirmed.')).toBeVisible();
  expect(screen.getByText('Review the recorded report.')).toBeVisible();
});
