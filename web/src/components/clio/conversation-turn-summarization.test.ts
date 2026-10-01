import type { Message } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { conversationTurnPresentation } from './conversation-turn-model';

const turn: Message = {
  id: 'message_turn',
  session_id: 'session_1',
  role: 'assistant',
  turn_id: 'turn_1',
  created_at: '2026-10-01T00:00:00Z',
  blocks: [
    { id: 'r1', type: 'reasoning', text: 'Read the station files.' },
    {
      id: 'part_summary',
      type: 'injection',
      source: 'summarization',
      text: 'The agent read the station files.',
      trigger: 'auto',
      compaction_id: 'cmp_1',
    },
    { id: 'r2', type: 'reasoning', text: 'Fit the displacement series.' },
    { id: 'answer', type: 'text', text: 'Done.', channel: 'answer' },
  ],
};

describe('conversationTurnPresentation summarizations', () => {
  it('keeps a mid-turn summary at its step, between the iterations around it', () => {
    const presentation = conversationTurnPresentation(turn, {});

    expect(presentation.iterations.map((iteration) => iteration.thinking[0]?.id)).toEqual([
      'r1',
      'r2',
    ]);
    expect(presentation.summarizations).toEqual([{ afterIteration: 1, block: turn.blocks[1] }]);
    expect(presentation.residualBlocks.map((block) => block.id)).toEqual(['answer']);
  });

  it('leaves other injections in the residual lane', () => {
    const presentation = conversationTurnPresentation(
      {
        ...turn,
        blocks: [
          turn.blocks[0]!,
          { id: 'hint', type: 'injection', source: 'path_hint', text: 'Did you mean data/a.csv?' },
        ],
      },
      {},
    );
    expect(presentation.summarizations).toEqual([]);
    expect(presentation.residualBlocks.map((block) => block.id)).toEqual(['hint']);
  });
});
