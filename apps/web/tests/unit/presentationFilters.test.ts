import { describe, it, expect } from 'vitest';
import {
  stripClioScaffolding,
  hasPriorAnswerRow,
  isBareJsonBody,
  isOrchestrationPlaceholder,
  isTerminalCompletionReasoning,
} from '../../src/components/presentationFilters.js';
import {
  filterVisibleRows,
  type TurnRow,
} from '../../src/components/transcriptDelegationModel.js';

/**
 * CHARACTERIZATION tests for the transitional prose-heuristic presentation
 * filters (contract/SPEC.md Appendix). These pin the CURRENT byte-for-byte
 * output of each filter so that centralizing them in presentationFilters.ts is a
 * behaviour-preserving move — and so that any future weakening/deletion is a
 * DELIBERATE, visible change (per clio #832 the deletion is server-driven, one
 * auditable step) rather than an accidental regression.
 */

const textRow = (agent: string, text: string): TurnRow =>
  ({ kind: 'text', id: `t-${agent}-${text.length}`, depth: 0, agent, text }) as unknown as TurnRow;

describe('stripClioScaffolding', () => {
  it('returns empty string for falsy input', () => {
    expect(stripClioScaffolding('')).toBe('');
  });

  it('leaves plain prose untouched', () => {
    expect(stripClioScaffolding('Just prose.')).toBe('Just prose.');
  });

  // NOTE (clio #877 / epic #880): stripClioScaffolding no longer strips `[[ ## field ## ]]`
  // markers. The prior SECTION_MARKER step was deleted as the paired client half of the
  // server-side root fix: clio's SDK thinking/contract splitter now promotes every real
  // line-start header to the contract stream (so no STRUCTURAL marker reaches the render),
  // and a marker the model QUOTES mid-prose while narrating the format is genuine reasoning
  // content that must render verbatim — stripping it produced the mangled ", then , then"
  // garble. This is the deliberate, server-driven deletion the header above anticipates.
  // (The prose scrub below — status parentheticals, typed-state captions — stays until its
  // own paired server fix lands, clio #881.)

  it('leaves a quoted [[ ## field ## ]] marker in reasoning prose untouched (verbatim render)', () => {
    expect(stripClioScaffolding('It emits `[[ ## reasoning ## ]]` first.')).toBe(
      'It emits `[[ ## reasoning ## ]]` first.',
    );
  });

  it('removes an inline (in progress …) placeholder, preserving the double space it leaves', () => {
    expect(stripClioScaffolding('The result (in progress now) is here.')).toBe(
      'The result  is here.',
    );
  });

  it('drops a whole-line status parenthetical but keeps the surrounding lines', () => {
    expect(
      stripClioScaffolding('line one\n(Routing to the geospatial expert now)\nline two'),
    ).toBe('line one\nline two');
  });

  it('removes a `typed workflow state:` caption + its balanced JSON blob', () => {
    expect(
      stripClioScaffolding('Real answer.\nCLIO typed workflow state:\n{"stage": "done"}'),
    ).toBe('Real answer.');
  });

  it('collapses 3+ blank lines to a single blank line', () => {
    expect(stripClioScaffolding('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('isBareJsonBody', () => {
  it('is true for a bare JSON object', () => {
    expect(isBareJsonBody('{"a": 1}')).toBe(true);
  });
  it('is true for a bare JSON array', () => {
    expect(isBareJsonBody('[1, 2, 3]')).toBe(true);
  });
  it('is false for prose', () => {
    expect(isBareJsonBody('This is an answer.')).toBe(false);
  });
  it('is false for a brace-wrapped non-JSON body', () => {
    expect(isBareJsonBody('{not json}')).toBe(false);
  });
  it('is false for empty / whitespace', () => {
    expect(isBareJsonBody('   ')).toBe(false);
  });
  it('trims before testing the wrappers', () => {
    expect(isBareJsonBody('  {"a":1}  ')).toBe(true);
  });
});

describe('isOrchestrationPlaceholder', () => {
  it.each([
    'No user-facing answer yet.',
    'Awaiting the geospatial child.',
    'Awaiting synthesis output.',
    'No evidence yet.',
    'No evidence is available.',
    'Pending the delegation to run.',
    'Delegating to the geospatial expert.',
    'Routing to synthesis.',
    'Routing to the data expert.',
    'Before routing to synthesis, I check.',
    'Before finishing, I confirm.',
  ])('is true for orchestration chrome: %s', (body) => {
    expect(isOrchestrationPlaceholder(body)).toBe(true);
  });

  it('is false for genuine prose', () => {
    expect(isOrchestrationPlaceholder('The dataset has 42 rows in the county table.')).toBe(false);
  });
});

describe('isTerminalCompletionReasoning', () => {
  it.each([
    'The task is complete.',
    'The task is fully satisfied.',
    'All required work is complete.',
    'All claims are grounded in evidence.',
    'The workflow is now complete.',
    'The workflow has already executed.',
    'Both required children returned.',
    'Both required pipeline stages ran.',
    'Synthesis has returned.',
    'I now finish.',
    'The parent finishes.',
    'I finish on the turn.',
    'Carrying the synthesis answer forward.',
    'There are no further children.',
    'There is no downstream work.',
  ])('is true for terminal-completion reasoning: %s', (body) => {
    expect(isTerminalCompletionReasoning(body)).toBe(true);
  });

  it('is false for substantive reasoning', () => {
    expect(isTerminalCompletionReasoning('I should geocode the county centroid next.')).toBe(false);
  });
});

describe('hasPriorAnswerRow', () => {
  const answer = textRow('main', 'This is a sufficiently long answer body.');

  it('is true when a long non-placeholder main/synthesis text precedes the index', () => {
    expect(hasPriorAnswerRow([answer], 1)).toBe(true);
  });
  it('only inspects rows STRICTLY before the index', () => {
    expect(hasPriorAnswerRow([answer], 0)).toBe(false);
  });
  it('ignores short bodies (<= 20 chars)', () => {
    expect(hasPriorAnswerRow([textRow('main', 'too short')], 1)).toBe(false);
  });
  it('ignores rows from other agents', () => {
    expect(hasPriorAnswerRow([textRow('geo', 'This is a sufficiently long answer body.')], 1)).toBe(
      false,
    );
  });
  it('ignores prior orchestration placeholders', () => {
    expect(
      hasPriorAnswerRow([textRow('main', 'No user-facing answer yet, still working here.')], 1),
    ).toBe(false);
  });
});

/**
 * Streaming-vs-settled gating lives in filterVisibleRows (which consumes the
 * moved predicates). Pinned here so the move keeps the completion-awareness
 * contract: the body-shape predicates only run once a turn is FINALIZED.
 */
describe('filterVisibleRows streaming-vs-settled gating', () => {
  const placeholder = textRow('main', 'Routing to synthesis before finishing.');

  it('drops an orchestration placeholder once FINALIZED (settled reload)', () => {
    expect(filterVisibleRows([placeholder])).toHaveLength(0);
  });
  it('keeps the same row while STREAMING (no mid-stream drop)', () => {
    expect(filterVisibleRows([placeholder], { streaming: true })).toHaveLength(1);
  });
  it('drops a bare-JSON body only when settled', () => {
    const json = textRow('main', '{"stage": "done"}');
    expect(filterVisibleRows([json])).toHaveLength(0);
    expect(filterVisibleRows([json], { streaming: true })).toHaveLength(1);
  });
  it('drops a genuinely empty text row even while streaming', () => {
    expect(filterVisibleRows([textRow('main', '   ')], { streaming: true })).toHaveLength(0);
  });
});
