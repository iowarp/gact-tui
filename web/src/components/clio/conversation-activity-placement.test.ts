import type { Message, ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  foldSubagentReturns,
  placeContinuedActivity,
  liveActivityIterationId,
} from './conversation-activity-placement';
import { conversationTurnPresentation } from './conversation-turn-model';

function assistant(id: string, blocks: Message['blocks']): Message {
  return { id, session_id: 's', role: 'assistant', created_at: '2026-10-12T00:00:00Z', blocks };
}

const tools: Record<string, ToolInvocation> = Object.fromEntries(
  ['ask', 'run', 'verify'].map((id) => [id, { id, session_id: 's', name: id, state: 'succeeded' }]),
);
const first = assistant('before', [{ id: 'ask-part', type: 'tool', tool_id: 'ask' }]);
const next = assistant('after', [
  { id: 'reminder', type: 'injection', source: 'todos', text: 'Continue checking.' },
  { id: 'run-part', type: 'tool', tool_id: 'run' },
  { id: 'answer', type: 'text', channel: 'answer', text: 'Verification finished.' },
]);

describe('following live activity', () => {
  const options = {
    activeTurnId: 'live',
    sessionState: 'running',
    presentations: new Map(),
    tools,
    tasks: {},
    feedback: new Map(),
    injections: new Map(),
  };
  it('opens finished calls in the current live group, then follows newer public entries', () => {
    const message = { ...first, run_id: 'live' };
    expect(liveActivityIterationId({ ...options, messages: [message] })).toBe('before:iteration:0');
    const update = {
      id: 'update',
      type: 'text' as const,
      channel: 'next_thought' as const,
      text: 'Inspect the next file.',
    };
    expect(
      liveActivityIterationId({
        ...options,
        messages: [{ ...message, blocks: [...message.blocks, update] }],
      }),
    ).toBeUndefined();
    expect(
      liveActivityIterationId({
        ...options,
        messages: [
          {
            ...message,
            blocks: [...message.blocks, update, { id: 'verify', type: 'tool', tool_id: 'verify' }],
          },
        ],
      }),
    ).toBe('before:iteration:1');
  });
  it('folds automatic activity for final text, artifacts, completed runs and unrelated turns', () => {
    const message = { ...first, run_id: 'live' };
    for (const block of [
      {
        id: 'answer',
        type: 'text' as const,
        channel: 'answer' as const,
        text: 'The result is ready.',
      },
      { id: 'artifact', type: 'artifact' as const, artifact_id: 'report' },
    ])
      expect(
        liveActivityIterationId({
          ...options,
          messages: [{ ...message, blocks: [...message.blocks, block] }],
        }),
      ).toBeUndefined();
    expect(
      liveActivityIterationId({ ...options, messages: [message], sessionState: 'idle' }),
    ).toBeUndefined();
    expect(
      liveActivityIterationId({ ...options, messages: [message], activeTurnId: 'other' }),
    ).toBeUndefined();
  });
  it('follows resumed work in its original owner row and folds it when the answer arrives', () => {
    const resumed = { ...next, run_id: 'live', blocks: next.blocks.slice(0, 2) };
    const messages = [first, resumed];
    const presentations = placeContinuedActivity(
      messages,
      new Set(['after']),
      tools,
      {},
      new Map(),
      new Map(),
    );
    expect(liveActivityIterationId({ ...options, messages, presentations })).toBe(
      'before:iteration:0',
    );
    const answered = [first, { ...next, run_id: 'live' }];
    expect(
      liveActivityIterationId({
        ...options,
        messages: answered,
        presentations: placeContinuedActivity(
          answered,
          new Set(['after']),
          tools,
          {},
          new Map(),
          new Map(),
        ),
      }),
    ).toBeUndefined();
  });
});

describe('continued operation placement', () => {
  it('keeps resumed activity in its own row across a delivered human steer', () => {
    const human: Message = {
      id: 'human',
      session_id: 's',
      role: 'user',
      created_at: first.created_at,
      blocks: [{ id: 'human-text', type: 'text', text: 'Use the new scope.' }],
      metadata: { steer_delivery: { assistant_message_id: 'before', after_part_id: 'ask-part' } },
    };
    for (const owner of ['before', 'after']) {
      const feedback = new Map([[owner, [human]]]);
      const placed = placeContinuedActivity(
        [first, next],
        new Set(['after']),
        tools,
        {},
        feedback,
        new Map(),
      );
      expect(placed.size).toBe(0);
      expect(
        conversationTurnPresentation(next, tools, {}).iterations[0]?.tools.map((tool) => tool.id),
      ).toEqual(['run']);
    }
  });

  it('keeps the question, reminder and resumed tools in one disclosure before the answer', () => {
    const placed = placeContinuedActivity(
      [first, next],
      new Set(['after']),
      tools,
      {},
      new Map(),
      new Map(),
    );
    expect(
      placed
        .get('before')
        ?.iterations.flatMap((iteration) => iteration.activity.map((entry) => entry.id)),
    ).toEqual(['ask', 'reminder', 'run']);
    expect(placed.get('after')?.segments).toEqual([{ kind: 'block', block: next.blocks[2] }]);
    expect(first.blocks).toHaveLength(1);
    expect(next.blocks).toHaveLength(3);
  });

  it('keeps the first disclosure identity across several internal continuations', () => {
    const middle = { ...next, blocks: next.blocks.slice(0, 2) };
    const last = assistant('last', [{ id: 'verify-part', type: 'tool', tool_id: 'verify' }]);
    const placed = placeContinuedActivity(
      [first, middle, last],
      new Set(['after', 'last']),
      tools,
      {},
      new Map(),
      new Map(),
    );
    expect(placed.get('before')?.iterations[0]?.id).toBe('before:iteration:0');
    expect(
      placed
        .get('before')
        ?.iterations.flatMap((iteration) => iteration.tools.map((tool) => tool.id)),
    ).toEqual(['ask', 'run', 'verify']);
    expect(placed.get('after')?.segments).toEqual([]);
    expect(placed.get('last')?.segments).toEqual([]);
  });

  it('preserves answer text, human prompts and explicit model or compaction boundaries', () => {
    const answered = {
      ...first,
      blocks: [...first.blocks, { id: 'text', type: 'text' as const, text: 'Interim answer.' }],
    };
    expect(
      placeContinuedActivity([answered, next], new Set(['after']), tools, {}, new Map(), new Map())
        .size,
    ).toBe(0);
    expect(
      placeContinuedActivity([first, next], new Set(), tools, {}, new Map(), new Map()).size,
    ).toBe(0);
    expect(
      placeContinuedActivity(
        [first, next],
        new Set(['after']),
        tools,
        {},
        new Map(),
        new Map(),
        new Set(['after']),
      ).size,
    ).toBe(0);
  });

  it('does not carry an interrupted operation bundle into a later turn', () => {
    const interrupted = { ...first, stop_reason: 'interrupted' };
    expect(
      placeContinuedActivity(
        [interrupted, next],
        new Set(['after']),
        tools,
        {},
        new Map(),
        new Map(),
      ).size,
    ).toBe(0);
  });
});

describe('recorded child returns', () => {
  it('folds duplicate terminal handoffs at the delivered result, retaining the launch and raw records', () => {
    const started = {
      id: 'launch',
      type: 'subagent' as const,
      subagent_id: 'child',
      stage: 'delegate.started' as const,
    };
    const early = { ...started, id: 'early', stage: 'delegate.completed' as const };
    const delivered = { ...early, id: 'delivered' };
    const original = [
      assistant('first', [started, { id: 'text', type: 'text', text: 'Still working.' }, early]),
      assistant('resumed', [delivered]),
    ];
    const folded = foldSubagentReturns(original);
    expect(folded[0]?.blocks.map((block) => block.id)).toEqual(['launch', 'text']);
    expect(folded[1]?.blocks).toEqual([delivered]);
    expect(original[0]?.blocks).toHaveLength(3);
    const turn = conversationTurnPresentation(folded[0]!, {});
    expect(turn.segments.at(-1)?.kind).toBe('block');
  });

  it('preserves distinct child runs and same-name tasks in different sessions', () => {
    const block = {
      id: 'a',
      type: 'subagent' as const,
      subagent_id: 'child',
      stage: 'delegate.completed' as const,
    };
    const original = [
      assistant('first', [block]),
      { ...assistant('second', [{ ...block, id: 'b' }]), session_id: 'other' },
    ];
    expect(foldSubagentReturns(original)).toEqual(original);
  });
});
