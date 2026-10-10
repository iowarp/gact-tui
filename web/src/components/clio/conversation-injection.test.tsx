import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
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
  it('keeps a tool-scoped addition inside Activity, expanding to the exact text', async () => {
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

    expect(screen.queryByText('Path suggestion')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Activity:/u }));
    await waitFor(() => expect(screen.getByText('Path suggestion')).toBeVisible());
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show what it got' }));
    expect(screen.getByText(/Did you mean 'data\/a.csv'/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open exact details' }));
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
      if (mode === 'chain') {
        expect(container.querySelector('[data-slot="harness-injection"]')).toBeNull();
        await user.click(screen.getByRole('button', { name: /^Activity:/u }));
      }
      expect(
        [...container.querySelectorAll('[data-turn-activity]')].map((item) =>
          item.getAttribute('data-turn-activity'),
        ),
      ).toEqual(['tool:call_read', 'injection:spill', 'tool:call_run', 'injection:warning']);
      expect(container.querySelectorAll('[data-slot="harness-injection"]')).toHaveLength(2);
      let spill = container.querySelector<HTMLElement>('[data-turn-activity="injection:spill"]')!;
      expect(spill).toHaveAttribute('data-call-id', 'call_read');
      await user.click(within(spill).getByRole('button', { name: 'Show what it got' }));
      expect(spill.querySelector('pre')?.textContent).toBe(text);
      if (mode === 'chain') {
        const chain = screen.getByRole('button', { name: /^Activity:/u });
        await user.click(chain);
        await user.click(chain);
        expect(
          container.querySelector('[data-turn-activity="injection:spill"] pre')?.textContent,
        ).toBe(text);
        spill = container.querySelector<HTMLElement>('[data-turn-activity="injection:spill"]')!;
      }
      await user.click(within(spill).getByRole('button', { name: 'Open exact details' }));
      expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
    },
  );

  it('keeps turn-wide context visible outside a collapsed activity chain', async () => {
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
    await waitFor(() => expect(screen.getByText(/gave the agent: Plan reminder/u)).toBeVisible());
    expect(container.querySelector('[data-turn-activity="injection:reminder"]')).toBeNull();
    expect(screen.getByRole('button', { name: /^Activity:/u })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('names an unlisted source plainly', () => {
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
    expect(screen.getByText(/gave the agent: New fix/)).toBeInTheDocument();
  });
});
