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
  await user.click(screen.getByRole('radio', { name: 'Full activity view' }));
  expect(await screen.findByRole('heading', { name: 'Recorded audit' })).toBeVisible();
  expect(screen.getByText('Get-Location')).toBeVisible();
  expect(screen.getByText('Connected-source access decisions could not be read')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Technical details for Run' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/D:\/dataset/)).toBeVisible();
});

it('folds recorded questions and answers at their owning tool, as in the live transcript', async () => {
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
          snapshot={{ responses: {}, sessions: {}, tables: {}, failures: [] }}
          onOpenFile={() => undefined}
          onOpenArtifact={() => undefined}
        />
      </ArchiveConnectionProvider>
    </QueryClientProvider>,
  );
  expect(screen.queryByText('PRIVATE RESUME ENVELOPE')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('radio', { name: 'Full activity view' }));
  expect(await screen.findByText('Which label is control?')).toBeVisible();
  expect(screen.getByText('The control mapping is unconfirmed.')).toBeVisible();
});
