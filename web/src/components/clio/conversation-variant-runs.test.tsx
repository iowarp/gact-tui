import {
  variantRunListSchema,
  variantRunsFromRecords,
  type Message,
  type PendingInteraction,
  type ToolInvocation,
  type TransportFrame,
} from '@clio/core/v3';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { useLiveStore } from '@/store/live-store';
import reloadFixture from '@/test-fixtures/variant-runs/refine-user-judged-reload.json';
import { ClioConversation } from './conversation';

// The tabs block inside the real conversation: where it lands, what it takes
// out of the turn, and the pick it answers instead of a plain choice list.

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
    scrollToIndex: vi.fn(),
  }),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

beforeEach(() => useLiveStore.getState().reset());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

describe('ClioConversation variant runs', () => {
  it('rebuilds a finished run in its turn after a reload, with the try advice inside its tab', () => {
    act(() =>
      useLiveStore
        .getState()
        .hydrateVariantRuns(
          variantRunsFromRecords(variantRunListSchema.parse(reloadFixture.variant_runs).runs),
        ),
    );
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={reloadFixture.messages as Message[]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const row = document.getElementById('message-msg_assistant_1')!;
    const block = within(row).getByRole('group', { name: 'Alternative drafts' });
    expect(within(block).getByRole('status')).toHaveTextContent('Draft 3 selected');
    // The turn keeps its own injection; the try's advice moved into the try's tab.
    expect(within(row).getAllByText(/gave the agent: Drafting alternatives/u)).toHaveLength(1);
    const advice = within(row).getAllByText(/gave the agent: Advice for this draft/u);
    expect(advice).toHaveLength(1);
    expect(block).toContainElement(advice[0]!);
    expect(document.getElementById('message-msg_user_1')).not.toContainElement(block);
    // The advice was injected in the resumed turn: its stamped block lands in the
    // try's tab, never in that turn's own lane.
    const resumed = document.getElementById('message-msg_assistant_2')!;
    expect(within(resumed).queryByText(/gave the agent: Advice for this draft/u)).toBeNull();
    expect(resumed).toHaveTextContent('Mesh study (0.6M, 1.2M, 2.1M cells)');
  });

  it('answers a pending pick in the tabs block, never as a plain choice card', async () => {
    let cursor = 0;
    const frame = (type: string, payload: Record<string, unknown>, id: string): TransportFrame => {
      cursor += 1;
      return {
        cursor: String(cursor),
        eventName: type,
        receivedAt: '2026-10-01T12:00:00Z',
        data: {
          protocol_version: '0.3',
          type,
          occurred_at: '2026-10-01T12:00:00Z',
          scope: { connection_id: 'local', session_id: 'sess_1' },
          entity_id: id,
          entity_revision: cursor,
          payload,
        },
      };
    };
    const run = {
      variants_id: 'var_1',
      session_id: 'sess_1',
      run_id: 'turn_1',
      agent_id: 'main',
      origin: 'draft_alternatives',
      strategy: 'best_of_n',
      judge: 'user',
      n: 2,
    };
    act(() =>
      useLiveStore.getState().applyFrames([
        frame(
          'variant.try.upserted',
          {
            id: 'var_1:0',
            ...run,
            try_index: 0,
            scope: 'main#run0',
            state: 'completed',
            text: 'Alpha',
          },
          'var_1:0',
        ),
        frame(
          'variant.try.upserted',
          {
            id: 'var_1:1',
            ...run,
            try_index: 1,
            scope: 'main#run1',
            state: 'completed',
            text: 'Beta',
          },
          'var_1:1',
        ),
      ]),
    );
    const interaction: PendingInteraction = {
      id: 'question:q_1',
      kind: 'question',
      owner_session_id: 'sess_1',
      attended_session_id: 'sess_1',
      status: 'pending',
      title: 'Question from agent',
      prompt: 'Which draft should continue the conversation?',
      source: { protocol: 'native', tool_name: 'draft_alternatives', invocation_id: 'call_draft' },
      created_at: '2026-10-01T12:00:10Z',
      payload: {
        question_id: 'q_1',
        question_kind: 'choice',
        metadata: {
          tool_name: 'draft_alternatives',
          variants_id: 'var_1',
          variant: {
            strategy: 'best_of_n',
            judge: 'user',
            n: 2,
            rubric: 'clear',
            refinable: false,
            candidates: [
              { id: 'main#run0', try_index: 0, text: 'Alpha' },
              { id: 'main#run1', try_index: 1, text: 'Beta' },
            ],
          },
        },
        allow_freeform: true,
        options: [
          { label: 'Draft 1', value: 'main#run0', description: 'Alpha' },
          { label: 'Draft 2', value: 'main#run1', description: 'Beta' },
        ],
      },
      actions: ['answer', 'cancel'],
    };
    const tool: ToolInvocation = {
      id: 'call_draft',
      session_id: 'sess_1',
      name: 'draft_alternatives',
      state: 'running',
    };
    const onInteractionResponse = vi.fn(async () => undefined);
    renderConversation(
      <ClioConversation
        artifacts={{}}
        interactions={[interaction]}
        messages={[
          {
            id: 'msg_a',
            session_id: 'sess_1',
            run_id: 'turn_1',
            role: 'assistant',
            created_at: '2026-10-01T12:00:00Z',
            blocks: [{ id: 'b_tool', type: 'tool', tool_id: 'call_draft' }],
          },
        ]}
        onInteractionResponse={onInteractionResponse}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{ call_draft: tool }}
      />,
    );

    expect(document.querySelector('[data-slot="inline-question"]')).toBeNull();
    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    await userEvent.click(within(block).getByRole('button', { name: 'Pick Draft 1' }));
    expect(onInteractionResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['main#run0'],
    });
  });
});
