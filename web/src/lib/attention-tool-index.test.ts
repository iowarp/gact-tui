import type { AttentionBlock, AttentionResult, AttentionSelection } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildMessageAttentionIndex, groupToolSteps, toolStepShare } from './attention-tool-index';

function block(overrides: Partial<AttentionBlock>): AttentionBlock {
  return {
    message_id: 'msg_1',
    part_id: 'p',
    field: 'text',
    kind: 'assistant_text',
    share: 0,
    mean: 0,
    runs: [],
    ...overrides,
  };
}

function payload(blocks: AttentionBlock[], selection: AttentionSelection = { text: 'x' }): AttentionResult {
  return {
    available: true,
    message_id: 'msg_1',
    selection,
    residual: 0.5,
    sources: [],
    flags: [],
    blocks,
  };
}

describe('groupToolSteps', () => {
  it('starts a new step at each thought block', () => {
    const blocks = [
      block({ part_id: 'call_0', kind: 'thought' }),
      block({ part_id: 'call_0', kind: 'tool_input' }),
      block({ part_id: 'result_0', kind: 'tool_result' }),
      block({ part_id: 'call_1', kind: 'thought' }),
      block({ part_id: 'call_1', kind: 'tool_input' }),
      block({ part_id: 'result_1', kind: 'tool_result' }),
    ];
    const steps = groupToolSteps(blocks);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveLength(3);
    expect(steps[1]).toHaveLength(3);
  });

  it('treats a run with no leading thought as one step', () => {
    const blocks = [
      block({ part_id: 'call_0', kind: 'tool_input' }),
      block({ part_id: 'result_0', kind: 'tool_result' }),
    ];
    expect(groupToolSteps(blocks)).toHaveLength(1);
  });

  it('is empty for no blocks', () => {
    expect(groupToolSteps([])).toEqual([]);
  });
});

describe('buildMessageAttentionIndex', () => {
  it('indexes text blocks by part id', () => {
    const textBlock = block({ part_id: 'u0', kind: 'user_text', share: 0.1 });
    const index = buildMessageAttentionIndex(payload([textBlock]), {
      id: 'msg_1',
      blocks: [],
    });
    expect(index.textBlocksByPartId.get('u0')).toBe(textBlock);
  });

  it('zips tool steps to tool MessageBlocks in document order, keyed by tool_id even when the block id differs', () => {
    const blocks = [
      block({ part_id: 'call_0', kind: 'thought', share: 0.01 }),
      block({ part_id: 'call_0', kind: 'tool_input', share: 0.02 }),
      block({ part_id: 'result_0', kind: 'tool_result', share: 0.03 }),
      block({ part_id: 'call_1', kind: 'thought', share: 0.04 }),
      block({ part_id: 'call_1', kind: 'tool_input', share: 0.05 }),
      block({ part_id: 'result_1', kind: 'tool_result', share: 0.06 }),
    ];
    // The reducer's own fixtures show block.id and tool_id can differ (e.g.
    // 'call_part' / 'call_1'); the index must key by tool_id regardless.
    const index = buildMessageAttentionIndex(payload(blocks), {
      id: 'msg_1',
      blocks: [
        { id: 'call_part_0', type: 'tool', tool_id: 'call_0' },
        { id: 'call_part_1', type: 'tool', tool_id: 'call_1' },
      ],
    });
    expect(toolStepShare(index.toolStepsByToolId.get('call_0'))).toBeCloseTo(0.06, 5);
    expect(toolStepShare(index.toolStepsByToolId.get('call_1'))).toBeCloseTo(0.15, 5);
  });

  it('drops extra tool steps beyond the number of rendered tool blocks, without crashing', () => {
    const blocks = [
      block({ part_id: 'call_0', kind: 'thought' }),
      block({ part_id: 'call_1', kind: 'thought' }),
    ];
    const index = buildMessageAttentionIndex(payload(blocks), {
      id: 'msg_1',
      blocks: [{ id: 'call_0', type: 'tool', tool_id: 'call_0' }],
    });
    expect(index.toolStepsByToolId.size).toBe(1);
  });

  it('echoes the selection part id and field only for the message the selection came from', () => {
    const selection: AttentionSelection = { text: 'closest station is MTA1', part_id: 't1_answer', field: 'text' };
    const forSelectionMessage = buildMessageAttentionIndex(payload([], selection), {
      id: 'msg_1', // payload().message_id defaults to 'msg_1'
      blocks: [],
    });
    expect(forSelectionMessage.selectionPartId).toBe('t1_answer');
    expect(forSelectionMessage.selectionField).toBe('text');

    const forOtherMessage = buildMessageAttentionIndex(payload([], selection), {
      id: 'msg_other',
      blocks: [],
    });
    expect(forOtherMessage.selectionPartId).toBeUndefined();
  });

  it('ignores blocks from other messages', () => {
    const index = buildMessageAttentionIndex(
      payload([block({ message_id: 'other', part_id: 'u0', kind: 'user_text' })]),
      { id: 'msg_1', blocks: [] },
    );
    expect(index.textBlocksByPartId.size).toBe(0);
  });

  it('is empty when attention is unavailable', () => {
    const index = buildMessageAttentionIndex(
      { available: false, message: 'No attention available.' },
      { id: 'msg_1', blocks: [] },
    );
    expect(index.textBlocksByPartId.size).toBe(0);
    expect(index.toolStepsByToolId.size).toBe(0);
  });
});

describe('toolStepShare', () => {
  it('sums share across entries', () => {
    expect(toolStepShare([block({ share: 0.1 }), block({ share: 0.2 })])).toBeCloseTo(0.3, 5);
  });

  it('is 0 for undefined', () => {
    expect(toolStepShare(undefined)).toBe(0);
  });
});
