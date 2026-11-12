import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { openActivityRuns } from '@/test/open-activity-runs';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';

// Harness injections (what CLIO gave the agent) get their own file, like the
// compaction checkpoint: `conversation.test.tsx` is at the file-size cap.

const virtualizerMocks = vi.hoisted(() => ({ scrollToIndex: vi.fn() }));

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        end: (index + 1) * 180,
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    measure: () => undefined,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  virtualizerMocks.scrollToIndex.mockClear();
  window.history.replaceState(null, '', window.location.pathname);
});

function renderConversation(element: ReactElement) {
  return render(
    // Message rows use motion's lazy `m.div`; load the same animation features
    // as the app so their initial opacity settles before visibility assertions.
    <LazyMotion features={domAnimation}>
      <AppearanceProvider>
        <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
      </AppearanceProvider>
    </LazyMotion>,
  );
}

describe('ClioConversation harness injection', () => {
  it('renders the parent assignment as a normal prompt, preserves its envelope, and names the answering agent and model', async () => {
    const prompt = 'Audit the archived observations.';
    const raw = JSON.stringify({
      assignment: prompt,
      parent_session_id: 'parent',
      launch_context: { input_task_refs: [] },
    });
    renderConversation(
      <ClioConversation
        agentName="Storage analyst"
        artifacts={{}}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
        messages={[
          {
            id: 'delegation',
            session_id: 'child',
            role: 'assistant',
            created_at: '2026-10-25T10:00:00Z',
            blocks: [
              { id: 'parent-prompt', type: 'injection', source: 'delegation', text: raw },
              { id: 'retained', type: 'text', text: 'Preserve the read-only boundary.' },
            ],
          },
          {
            id: 'answer',
            session_id: 'child',
            role: 'assistant',
            created_at: '2026-10-25T10:00:01Z',
            completed_at: '2026-10-25T10:00:07Z',
            stop_reason: 'end_turn',
            model: { model_id: 'gpt-6.1-sol', provider_id: 'codex' },
            blocks: [{ id: 'answer-text', type: 'text', text: 'I will inspect the archive.' }],
          },
        ]}
      />,
    );
    expect(await screen.findByText(prompt)).toBeVisible();
    expect(screen.getAllByText('gpt-6.1-sol').length).toBeGreaterThan(0);
    // The answering agent is named in the reply's model card, not a header.
    await userEvent.hover(document.querySelector<HTMLElement>('[data-slot="message-reply-meta"]')!);
    expect(await screen.findByText('Storage analyst', {}, { timeout: 2000 })).toBeVisible();
    expect(screen.queryByText('Agent Workspace')).toBeNull();
    expect(screen.getByText('Preserve the read-only boundary.')).toBeVisible();
    expect(screen.queryByText(raw)).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Technical details for Parent assignment' }),
    );
    expect(await screen.findByText(raw)).toBeVisible();
    expect(screen.getAllByText(prompt)).toHaveLength(1);
  });
  it.each(['goal_judgment', 'loop_wake', 'scheduled_wake'])(
    'continues the human prompt with a %s injection and no user controls',
    async (source) => {
      const user = userEvent.setup();
      const onMarkMessage = vi.fn(async () => undefined);
      const { container } = renderConversation(
        <ClioConversation
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
          onMarkMessage={onMarkMessage}
          onForkFromMessage={vi.fn()}
          onRewindToMessage={vi.fn()}
          messages={[
            {
              id: 'prompt',
              session_id: 'session_1',
              role: 'user',
              created_at: '2026-10-12T00:00:00Z',
              blocks: [{ id: 'prompt_text', type: 'text', text: 'Prepare the report.' }],
            },
            {
              id: 'first',
              session_id: 'session_1',
              role: 'assistant',
              created_at: '2026-10-12T00:00:01Z',
              blocks: [{ id: 'answer', type: 'text', text: 'The first section is saved.' }],
            },
            {
              id: 'wake',
              session_id: 'session_1',
              role: 'system',
              created_at: '2026-10-12T00:00:02Z',
              blocks: [
                {
                  id: 'injected',
                  type: 'injection',
                  source,
                  text: 'The report is incomplete. Save the remaining section.',
                },
              ],
            },
            {
              id: 'continued',
              session_id: 'session_1',
              role: 'assistant',
              created_at: '2026-10-12T00:00:03Z',
              blocks: [{ id: 'result', type: 'text', text: 'The report is complete.' }],
            },
          ]}
        />,
      );
      expect(container.querySelectorAll('[data-slot="user-message-actions"]')).toHaveLength(1);
      const wake = within(container.querySelector<HTMLElement>('[data-message-id="wake"]')!);
      expect(wake.queryByRole('button', { name: 'Copy message' })).toBeNull();
      expect(wake.queryByRole('button', { name: 'Fork into a new conversation' })).toBeNull();
      expect(wake.queryByRole('button', { name: 'Rewind to here' })).toBeNull();
      expect(wake.queryByRole('button', { name: /Mark message/u })).toBeNull();
      expect(screen.queryByText(/The report is incomplete/u)).toBeNull();
      const continued = within(
        container.querySelector<HTMLElement>('[data-message-id="continued"]')!,
      );
      await user.click(continued.getByRole('button', { name: 'Expand Received 1 update' }));
      await user.click(continued.getByRole('button', { name: /^Injection/u }));
      expect(
        continued.getByText('The report is incomplete. Save the remaining section.'),
      ).toBeVisible();
      const prompt = within(container.querySelector<HTMLElement>('[data-message-id="prompt"]')!);
      expect(prompt.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
      expect(prompt.queryByRole('button', { name: 'Fork into a new conversation' })).toBeNull();
      expect(prompt.queryByRole('button', { name: 'Rewind to here' })).toBeNull();
      expect(prompt.queryByRole('button', { name: 'Select content for attention' })).toBeNull();
    },
  );

  it('shows a tool-scoped addition as an activity row, expanding to the exact text', async () => {
    const user = userEvent.setup();
    const text =
      "[clio: path_hint]\nargument 'path': 'a.csv' does not exist. Did you mean 'data/a.csv'?";
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_injection',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-29T00:00:00Z',
            blocks: [
              { id: 'inj_1', type: 'injection', source: 'path_hint', text, call_id: 'call_1' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Expand Received 1 update' }));
    await waitFor(() => expect(screen.getByText('Path suggestion')).toBeVisible());
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Injection Path suggestion/u }));
    expect(screen.getByText(/Did you mean 'data\/a.csv'/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Technical details for Path suggestion' }));
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
  });

  it.each(['chain', 'full'] as const)(
    'retains spill and failure feedback in causal order without duplicates in %s mode',
    async (mode) => {
      // Field-evidence links reveal the owning message in Full activity.
      if (mode === 'full') {
        window.history.replaceState(null, '', '#message-message_tool_feedback?part=spill');
      }
      const user = userEvent.setup();
      const text = '[clio: result_spilled] The complete result is in `tool-output/result.json`.';
      const { container } = renderConversation(
        <ClioConversation
          artifacts={{}}
          messages={[
            {
              id: 'message_tool_feedback',
              session_id: 'session_1',
              role: 'assistant',
              created_at: '2026-10-09T00:00:00Z',
              completed_at: '2026-10-09T00:00:03Z',
              blocks: [
                { id: 'read', type: 'tool', tool_id: 'call_read' },
                {
                  id: 'spill',
                  type: 'injection',
                  source: 'result_spilled',
                  call_id: 'call_read',
                  text,
                },
                { id: 'run', type: 'tool', tool_id: 'call_run' },
                {
                  id: 'warning',
                  type: 'injection',
                  source: 'circuit_breaker',
                  call_id: 'call_run',
                  text: 'Repeated failures: inspect the argument before retrying.',
                },
                {
                  id: 'answer',
                  type: 'text',
                  channel: 'answer',
                  text: 'The manifest is available.',
                },
              ],
            },
          ]}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{
            call_read: {
              id: 'call_read',
              session_id: 'session_1',
              name: 'fs_read_file',
              state: 'succeeded',
              title: 'Read manifest.json',
            },
            call_run: {
              id: 'call_run',
              session_id: 'session_1',
              name: 'shell_bash',
              state: 'failed',
              title: 'Run table analysis',
            },
          }}
        />,
      );
      await waitFor(() => expect(screen.getByText('The manifest is available.')).toBeVisible());
      openActivityRuns(container);
      expect(
        [...container.querySelectorAll('[data-turn-activity]')].map((item) =>
          item.getAttribute('data-turn-activity'),
        ),
      ).toEqual(['tool:call_read', 'injection:spill', 'tool:call_run', 'injection:warning']);
      expect(container.querySelectorAll('[data-slot="harness-injection"]')).toHaveLength(2);
      const spill = container.querySelector<HTMLElement>('[data-turn-activity="injection:spill"]')!;
      expect(spill).toHaveAttribute('data-call-id', 'call_read');
      await user.click(within(spill).getByRole('button', { name: /^Injection/u }));
      expect(spill.querySelector('pre')?.textContent).toBe(text);
      await user.click(
        within(spill).getByRole('button', {
          name: 'Technical details for Large result saved to a file',
        }),
      );
      expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
    },
  );

  it('shows turn-wide context as an activity row in the chain', async () => {
    const user = userEvent.setup();
    const { container } = renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_reminder',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-10-09T00:00:00Z',
            blocks: [
              { id: 'read', type: 'tool', tool_id: 'call_read' },
              {
                id: 'reminder',
                type: 'injection',
                source: 'plan_mode',
                text: 'Inspect before executing.',
              },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{
          call_read: {
            id: 'call_read',
            session_id: 'session_1',
            name: 'fs_read_file',
            state: 'succeeded',
          },
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Activity/u })).toBeNull();
    openActivityRuns(container);
    const reminder = container.querySelector<HTMLElement>(
      '[data-turn-activity="injection:reminder"]',
    )!;
    await waitFor(() => expect(within(reminder).getByText('Plan mode')).toBeVisible());
    await user.click(within(reminder).getByRole('button', { name: /^Injection/u }));
    expect(within(reminder).getByText('Inspect before executing.')).toBeVisible();
  });

  it('names an unlisted source plainly', async () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_injection_2',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-29T00:00:00Z',
            blocks: [{ id: 'inj_2', type: 'injection', source: 'new_fix', text: 'x' }],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Expand Received 1 update' }));
    expect(screen.getByText('New fix')).toBeInTheDocument();
  });
});
