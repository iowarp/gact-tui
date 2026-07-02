import { describe, it, expect } from 'vitest';
import { filterVisibleRows } from '../../src/components/transcriptDelegationModel.js';
import type { TurnRow } from '../../src/components/transcriptDelegationModel.js';

// A2: while a turn is still streaming, the body-shape predicates judge INCOMPLETE
// text and must NOT drop main/synthesis rows mid-stream (they would only pop in
// when complete). Once finalized, the full filter applies — so a completed-session
// reload (no opts) stays byte-identical.
describe('filterVisibleRows completion-awareness (A2)', () => {
  const placeholder = {
    kind: 'text',
    id: 'r1',
    agent: 'main',
    depth: 0,
    text: 'Routing to synthesis before finishing.',
  } as unknown as TurnRow;

  it('drops an orchestration-placeholder row once FINALIZED', () => {
    expect(filterVisibleRows([placeholder])).toHaveLength(0);
  });

  it('keeps the same row while STREAMING (no mid-stream drop)', () => {
    expect(filterVisibleRows([placeholder], { streaming: true })).toHaveLength(1);
  });

  it('still drops a structurally-empty row while streaming', () => {
    const empty = { kind: 'text', id: 'r2', agent: 'main', depth: 0, text: '   ' } as unknown as TurnRow;
    expect(filterVisibleRows([empty], { streaming: true })).toHaveLength(0);
  });
});
