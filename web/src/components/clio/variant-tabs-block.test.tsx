import {
  variantRunListSchema,
  variantRunsFromRecords,
  type Message,
  type PendingInteraction,
  type PendingInteractionResponse,
  type TransportFrame,
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

/** The unified interaction the server projects for a pick question (with its metadata). */
function pickInteraction(refinable: boolean): PendingInteraction {
  return {
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
      allow_freeform: true,
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
    actions: ['answer', 'cancel'],
  };
}

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
  it('keeps streaming reasoning out of draft text and collapsed', () => {
    const id = 'var_1:0';
    apply(
      tryUpsert(0),
      frame(
        'variant.try.delta',
        {
          id,
          variants_id: 'var_1',
          try_index: 0,
          kind: 'thinking',
          delta: 'I should plan five poems.',
        },
        id,
      ),
      tryDelta(0, 'One poem only'),
    );
    renderRuns();
    expect(screen.getByText('One poem only')).toBeVisible();
    expect(screen.queryByText('I should plan five poems.')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="variant-try-text"]')).not.toHaveTextContent('plan');
  });

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
        {
          ...tryPayload(0),
          judge: 'lm',
          rubric: 'One concise poem for a friend.',
          state: 'completed',
          text: 'A',
          score: 0.5,
        },
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
    await userEvent.click(screen.getByRole('button', { name: 'Evaluation criteria' }));
    expect(screen.getByText('One concise poem for a friend.')).toBeVisible();
    expect(screen.getByText(/The model scores each evaluated draft from 0 to 1/u)).toBeVisible();
    await userEvent.click(tabs[1]!);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('B');
  });

  it('picks exactly one draft and sends the refine comment with it', async () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      tryUpsert(1, { state: 'completed', text: 'Beta two' }),
    );
    const pick = pickInteraction(true);
    const { onInteractionResponse } = renderRuns({ interactions: [pick] });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your pick');

    await userEvent.click(screen.getByRole('tab', { name: /Draft 1/u }));
    const comment = screen.getByRole('textbox', { name: 'Comment for Draft 1 (optional)' });
    await userEvent.type(comment, '  Shorter, please ');
    await userEvent.click(screen.getByRole('button', { name: 'Refine Draft 1' }));

    expect(onInteractionResponse).toHaveBeenCalledTimes(1);
    expect(onInteractionResponse).toHaveBeenCalledWith(pick, {
      action: 'answer',
      selected_options: ['main#run0'],
      answer: 'Shorter, please',
    });
  });

  it('accepts a pick without a comment and offers no comment box when not refinable', async () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      tryUpsert(1, { state: 'completed', text: 'Beta two' }),
    );
    const pick = pickInteraction(false);
    const { onInteractionResponse } = renderRuns({ interactions: [pick] });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Draft 2/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Pick Draft 2' }));
    expect(onInteractionResponse).toHaveBeenCalledWith(pick, {
      action: 'answer',
      selected_options: ['main#run1'],
    });
  });

  it('keeps the error in the tab when the pick is refused', async () => {
    apply(tryUpsert(0, { state: 'completed', text: 'Alpha one' }));
    renderRuns({
      interactions: [pickInteraction(false)],
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
    renderRuns({ interactions: [pickInteraction(true)] });

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
  it('rebuilds the finished run read-only from the served records and the messages', async () => {
    const runs = variantRunsFromRecords(
      variantRunListSchema.parse(reloadFixture.variant_runs).runs,
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

    // The selected draft opens first, with the advice it was given as an injection
    // (once: its recorded step that carries the same advice is not repeated).
    const panel = within(block).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Refined from Draft 2');
    expect(within(panel).getAllByText(/gave the agent: Advice for this draft/u)).toHaveLength(1);
    expect(panel).toHaveTextContent('1,610 tokens');
    await userEvent.click(within(panel).getByRole('button', { name: '1 recorded step' }));
    expect(within(panel).queryByText('Given to this try')).not.toBeInTheDocument();
    expect(within(block).queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();

    await userEvent.click(tabs[1]!);
    expect(within(block).getByRole('tabpanel')).toHaveTextContent(
      'Your comment: Add the cell count of the coarsest mesh too.',
    );

    // A try's recorded steps: thinking, its tool call with the result, its text.
    await userEvent.click(tabs[0]!);
    const first = within(block).getByRole('tabpanel');
    await userEvent.click(within(first).getByRole('button', { name: '3 recorded steps' }));
    const steps = first.querySelector('[data-slot="variant-try-steps"]') as HTMLElement;
    expect(steps).toHaveTextContent('read_file');
    expect(within(steps).getByText(/Thinking|Thought/u)).toBeInTheDocument();
    expect(steps).toHaveTextContent('The mesh converges at 2.1 million cells.');
  });

  it('brings back an LM-judged run with its scores', () => {
    const runs = variantRunsFromRecords(
      variantRunListSchema.parse({
        session_id: 'sess_1',
        runs: [
          {
            schema: 'clio.variant_run.v1',
            variants_id: 'var_lm',
            session_id: 'sess_1',
            agent_id: 'main',
            origin: 'draft_alternatives',
            strategy: 'best_of_n',
            judge: 'lm',
            n: 2,
            n_requested: 2,
            rubric: 'clear',
            threshold: 0.8,
            status: 'selected',
            turn_id: 'msg_user_1',
            anchor_message_id: '',
            question_id: '',
            pick: null,
            comment: '',
            selected_index: 1,
            tries: [0, 1].map((index) => ({
              try_index: index,
              scope: `main#run${index}`,
              state: 'completed',
              text: index ? 'Beta' : 'Alpha',
              score: index ? 0.9 : 0.4,
              tokens: { input: 1, output: 1, total: 2 },
              advice: '',
              forked_from: null,
              error: '',
              turn_id: 'msg_user_1',
              anchor_message_id: '',
              steps: [],
            })),
          },
        ],
      }).runs,
    );
    act(() => useLiveStore.getState().hydrateVariantRuns(runs));
    const user: Message = {
      id: 'msg_user_1',
      session_id: 'sess_1',
      role: 'user',
      created_at: '2026-10-01T11:59:59Z',
      blocks: [],
    };
    const answer: Message = { ...assistant, id: 'msg_answer', run_id: undefined };
    // No anchor message yet: the turn's user message places it at the answer after it.
    renderRuns({ message: answer, messages: [user, answer] });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Draft 1Score 0.4',
      'Draft 2Score 0.9Selected',
    ]);
    expect(screen.getByText('Best of 2 · judged by the model')).toBeInTheDocument();
  });
});

function closedFrame(status: string, extra: Record<string, unknown> = {}): TransportFrame {
  return frame(
    'variant.closed',
    {
      ...RUN,
      status,
      reason: `variant_pick_${status}`,
      question_id: 'q_1',
      closed_at: '2026-10-01T12:05:00Z',
      candidates: [
        { try_index: 0, scope: 'main#run0', text: 'Alpha one' },
        { try_index: 1, scope: 'main#run1', text: 'Beta two' },
      ],
      ...extra,
    },
    'var_1',
  );
}

describe('VariantTabsBlock for a run closed without a pick', () => {
  it('shows a superseded run read-only, with a way to the message that superseded it', () => {
    apply(
      tryUpsert(0, { state: 'completed', text: 'Alpha one' }),
      closedFrame('superseded', { superseded_by_message_id: 'msg_user_2' }),
    );
    // Even a stale pending interaction row offers no pick on a closed run.
    renderRuns({ interactions: [pickInteraction(true)] });

    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    expect(within(block).getByRole('status')).toHaveTextContent('Superseded by your next message');
    const notice = block.querySelector('[data-slot="variant-closed"]') as HTMLElement;
    expect(notice).toHaveTextContent('You sent a new message instead of picking.');
    expect(within(notice).getByRole('link', { name: 'Go to your message' })).toHaveAttribute(
      'href',
      '#message-msg_user_2',
    );
    // The drafts it offered are still readable, one tab each.
    expect(
      within(block)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Draft 1', 'Draft 2']);
    expect(within(block).getByRole('tabpanel')).toHaveTextContent('Alpha one');
    expect(within(block).queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();
    expect(within(block).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each([
    ['cancelled', 'Cancelled', 'The pick was cancelled.'],
    ['expired', 'Expired', 'The time to pick ran out.'],
  ])('shows a %s run as %s with no pick', (status, label, notice) => {
    apply(closedFrame(status));
    renderRuns({
      interactions: [
        { ...pickInteraction(false), status: status as PendingInteraction['status'], actions: [] },
      ],
    });

    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    expect(within(block).getByRole('status')).toHaveTextContent(label);
    expect(block.querySelector('[data-slot="variant-closed"]')).toHaveTextContent(notice);
    expect(within(block).queryByRole('link')).not.toBeInTheDocument();
    expect(within(block).queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();
  });

  it('renders the same closed run after a reload from the served records', () => {
    const runs = variantRunsFromRecords(
      variantRunListSchema.parse({
        session_id: 'sess_1',
        runs: [
          {
            schema: 'clio.variant_run.v1',
            variants_id: 'var_1',
            session_id: 'sess_1',
            agent_id: 'main',
            origin: 'draft_alternatives',
            strategy: 'best_of_n',
            judge: 'user',
            n: 2,
            status: 'superseded',
            closed_reason: 'variant_pick_superseded',
            closed_at: '2026-10-01T12:05:00Z',
            superseded_by_message_id: 'msg_user_2',
            question_id: 'q_1',
            turn_id: 'turn_1',
            anchor_message_id: 'msg_a',
            pick: null,
            comment: '',
            selected_index: null,
            tries: [0, 1].map((index) => ({
              try_index: index,
              scope: `main#run${index}`,
              state: 'completed',
              text: index ? 'Beta two' : 'Alpha one',
              score: null,
              turn_id: 'turn_1',
              anchor_message_id: 'msg_a',
              steps: [],
            })),
          },
        ],
      }).runs,
    );
    act(() => useLiveStore.getState().hydrateVariantRuns(runs));
    renderRuns();

    const block = screen.getByRole('group', { name: 'Alternative drafts' });
    expect(within(block).getByRole('status')).toHaveTextContent('Superseded by your next message');
    expect(within(block).getByRole('link', { name: 'Go to your message' })).toHaveAttribute(
      'href',
      '#message-msg_user_2',
    );
    expect(within(block).getAllByRole('tab')).toHaveLength(2);
    expect(within(block).queryByRole('button', { name: /Pick|Refine/u })).not.toBeInTheDocument();
  });

  it('shows the pick deadline on the pick row while the pick waits', () => {
    apply(tryUpsert(0, { state: 'completed', text: 'Alpha one' }));
    const pick = pickInteraction(false);
    renderRuns({
      interactions: [{ ...pick, payload: { ...pick.payload, expires_at: '2026-10-01T12:30:00Z' } }],
    });
    const row = document.querySelector('[data-slot="variant-pick"]') as HTMLElement;
    expect(within(row).getByRole('button', { name: 'Pick Draft 1' })).toBeInTheDocument();
    const deadline = row.querySelector('[data-slot="variant-pick-deadline"]') as HTMLElement;
    expect(deadline).toHaveTextContent(/^Pick by .+; after that the drafts expire\.$/u);
    expect(deadline.querySelector('time')).toHaveAttribute('datetime', '2026-10-01T12:30:00Z');
  });

  it('shows no deadline for a pick without one', () => {
    apply(tryUpsert(0, { state: 'completed', text: 'Alpha one' }));
    renderRuns({ interactions: [pickInteraction(false)] });
    expect(document.querySelector('[data-slot="variant-pick-deadline"]')).toBeNull();
  });
});
