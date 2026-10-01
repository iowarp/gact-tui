import {
  variantRunsFromTrace,
  type Message,
  type PendingInteraction,
  type PendingInteractionResponse,
  type TransportFrame,
  type UserQuestion,
  type VariantSemanticEvent,
} from '@clio/core/v3';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';
import reloadFixture from '@/test-fixtures/variant-runs/refine-user-judged-reload.json';
import { PresentationNavigation } from './presentation-navigation';
import { VariantRunsForMessage } from './variant-runs-for-message';

let cursor = 0;

/** A v3 frame as clio-agent's `event_to_v3` projects a variant row. */
function frame(type: string, payload: Record<string, unknown>, entityId?: string): TransportFrame {
  cursor += 1;
  return {
    cursor: String(cursor),
    eventName: type,
    receivedAt: '2026-10-01T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-10-01T12:00:00Z',
      scope: { connection_id: 'local', session_id: 'sess_1', run_id: 'turn_1' },
      entity_id: entityId,
      entity_revision: cursor,
      payload,
    },
  };
}

const RUN = {
  variants_id: 'var_1',
  session_id: 'sess_1',
  run_id: 'turn_1',
  agent_id: 'main',
  origin: 'draft_alternatives',
  strategy: 'refine',
  judge: 'user',
  n: 3,
};

function tryUpsert(index: number, extra: Record<string, unknown> = {}): TransportFrame {
  const id = `var_1:${index}`;
  return frame(
    'variant.try.upserted',
    { id, ...RUN, try_index: index, scope: `main#run${index}`, state: 'running', ...extra },
    id,
  );
}

function tryDelta(index: number, delta: string): TransportFrame {
  const id = `var_1:${index}`;
  return frame(
    'variant.try.delta',
    { id, variants_id: 'var_1', try_index: index, kind: 'text', delta },
    id,
  );
}

function pickQuestion(refinable: boolean, status = 'pending'): TransportFrame {
  return frame(
    'question.upserted',
    {
      id: 'q_1',
      session_id: 'sess_1',
      prompt: 'Which draft should continue the conversation?',
      status,
      kind: 'choice',
      allow_freeform: true,
      options: [
        { label: 'Draft 1', value: 'main#run0', description: 'Alpha one' },
        { label: 'Draft 2', value: 'main#run1', description: 'Beta two' },
      ],
      selected_options: [],
      created_at: '2026-10-01T12:00:10Z',
      updated_at: '2026-10-01T12:00:10Z',
      metadata: {
        tool_name: 'draft_alternatives',
        variants_id: 'var_1',
        variant: {
          strategy: 'refine',
          judge: 'user',
          n: 3,
          rubric: 'clear',
          refinable,
          candidates: [
            { id: 'main#run0', try_index: 0, text: 'Alpha one' },
            { id: 'main#run1', try_index: 1, text: 'Beta two' },
          ],
        },
      },
    },
    'q_1',
  );
}

/** The unified interaction the server projects for that question. */
const pickInteraction: PendingInteraction = {
  id: 'question:q_1',
  kind: 'question',
  owner_session_id: 'sess_1',
  attended_session_id: 'sess_1',
  status: 'pending',
  title: 'Question from agent',
  prompt: 'Which draft should continue the conversation?',
  source: { protocol: 'native', tool_name: 'draft_alternatives', invocation_id: 'call_draft' },
  created_at: '2026-10-01T12:00:10Z',
  payload: { question_id: 'q_1', question_kind: 'choice', allow_freeform: true },
  actions: ['answer', 'cancel'],
};

const assistant: Message = {
  id: 'msg_a',
  session_id: 'sess_1',
  run_id: 'turn_1',
  role: 'assistant',
  created_at: '2026-10-01T12:00:00Z',
  blocks: [{ id: 'b_tool', type: 'tool', tool_id: 'call_draft' }],
};

function apply(...frames: TransportFrame[]) {
  act(() => useLiveStore.getState().applyFrames(frames));
}

function renderRuns({
  message = assistant,
  messages = [assistant],
  interactions = [] as PendingInteraction[],
  onInteractionResponse = vi.fn(
    async (_interaction: PendingInteraction, _response: PendingInteractionResponse) => undefined,
  ),
} = {}) {
  render(
    <PresentationNavigation.Provider
      value={{ artifacts: {}, subagents: {}, messages, interactions, onInteractionResponse }}
    >
      <VariantRunsForMessage message={message} />
    </PresentationNavigation.Provider>,
  );
  return { onInteractionResponse };
}

beforeEach(() => {
  useLiveStore.getState().reset();
});
afterEach(cleanup);

describe('VariantTabsBlock', () => {
  it('shows one tab per try, each streaming its own try live', () => {
    apply(tryUpsert(0), tryUpsert(1), tryDelta(0, 'Alpha '), tryDelta(1, 'Beta '));
    renderRuns();

    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    const tabs = within(block).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Draft 1Running', 'Draft 2Running']);
    expect(within(block).getByRole('status')).toHaveTextContent('2 of 2 running');
    expect(within(block).getByRole('tabpanel')).toHaveTextContent('Alpha');

    apply(tryDelta(0, 'one'), tryDelta(1, 'two'));
    expect(within(block).getByRole('tabpanel')).toHaveTextContent('Alpha one');
    expect(screen.queryByRole('button', { name: /Pick/u })).not.toBeInTheDocument();
  });

  it('shows the model judge score on each tab', async () => {
    apply(
      frame(
        'variant.try.upserted',
        { ...tryPayload(0), judge: 'lm', state: 'completed', text: 'A', score: 0.5 },
        'var_1:0',
      ),
      frame(
        'variant.try.upserted',
        { ...tryPayload(1), judge: 'lm', state: 'completed', text: 'B', score: 0.875 },
        'var_1:1',
      ),
    );
    renderRuns();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Score 0.5');
    expect(tabs[1]).toHaveTextContent('Score 0.88');
    await userEvent.click(tabs[1]!);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('B');
  });

  it('picks exactly one draft and sends the refine comment with it', async () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      tryUpsert(1, { state: 'completed', text: 'Beta two' }),
      pickQuestion(true),
    );
    const { onInteractionResponse } = renderRuns({ interactions: [pickInteraction] });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your pick');

    await userEvent.click(screen.getByRole('tab', { name: /Draft 1/u }));
    const comment = screen.getByRole('textbox', { name: 'Comment for Draft 1 (optional)' });
    await userEvent.type(comment, '  Shorter, please ');
    await userEvent.click(screen.getByRole('button', { name: 'Refine Draft 1' }));

    expect(onInteractionResponse).toHaveBeenCalledTimes(1);
    expect(onInteractionResponse).toHaveBeenCalledWith(pickInteraction, {
      action: 'answer',
      selected_options: ['main#run0'],
      answer: 'Shorter, please',
    });
  });

  it('accepts a pick without a comment and offers no comment box when not refinable', async () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      tryUpsert(1, { state: 'completed', text: 'Beta two' }),
      pickQuestion(false),
    );
    const { onInteractionResponse } = renderRuns({ interactions: [pickInteraction] });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Draft 2/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Pick Draft 2' }));
    expect(onInteractionResponse).toHaveBeenCalledWith(pickInteraction, {
      action: 'answer',
      selected_options: ['main#run1'],
    });
  });

  it('keeps the error in the tab when the pick is refused', async () => {
    apply(tryUpsert(0, { state: 'completed', text: 'Alpha one' }), pickQuestion(false));
    renderRuns({
      interactions: [pickInteraction],
      onInteractionResponse: vi.fn(async () => {
        throw new Error('pick exactly one draft');
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Pick Draft 1' }));
    expect(await screen.findByText('pick exactly one draft')).toBeInTheDocument();
  });

  it('becomes the read-only record once a draft is selected', () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      tryUpsert(1, { state: 'completed', text: 'Beta two' }),
      pickQuestion(true),
      frame(
        'variant.selected',
        {
          ...RUN,
          selected_index: 1,
          selected_scope: 'main#run1',
          text: 'Beta two',
          scores: [],
          pick: 1,
          comment: '',
        },
        'var_1',
      ),
    );
    renderRuns({ interactions: [pickInteraction] });

    expect(screen.getByRole('status')).toHaveTextContent('Draft 2 selected');
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('Draft 2');
    expect(selected).toHaveTextContent('Your pick');
    expect(selected).toHaveTextContent('Selected');
    expect(screen.queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders nothing at a message the run does not belong to', () => {
    apply(tryUpsert(0));
    const other: Message = { ...assistant, id: 'msg_b', run_id: 'turn_9', blocks: [] };
    renderRuns({ message: other, messages: [assistant, other] });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

function tryPayload(index: number): Record<string, unknown> {
  return { id: `var_1:${index}`, ...RUN, try_index: index, scope: `main#run${index}` };
}

describe('VariantTabsBlock after a reload', () => {
  it('rebuilds the finished run read-only from the trace, the questions and the messages', async () => {
    const runs = variantRunsFromTrace(
      reloadFixture.trace.events as VariantSemanticEvent[],
      reloadFixture.questions as unknown as UserQuestion[],
      reloadFixture.session_id,
    );
    act(() => useLiveStore.getState().hydrateVariantRuns(runs));
    const messages = reloadFixture.messages as Message[];
    renderRuns({ message: messages[1]!, messages });

    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    expect(within(block).getByText('Refine, up to 3 tries · you pick')).toBeInTheDocument();
    expect(within(block).getByRole('status')).toHaveTextContent('Draft 3 selected');
    const tabs = within(block).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Draft 1',
      'Draft 2Your pick',
      'Draft 3Your pickSelected',
    ]);

    // The selected draft opens first, with the advice it was given as an injection.
    const panel = within(block).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Refined from Draft 2');
    expect(within(panel).getAllByText(/gave the agent: Advice for this draft/u)).toHaveLength(1);
    expect(panel).toHaveTextContent('1,610 tokens');
    expect(within(block).queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();

    await userEvent.click(tabs[1]!);
    expect(within(block).getByRole('tabpanel')).toHaveTextContent(
      'Your comment: Add the cell count of the coarsest mesh too.',
    );
  });
});
