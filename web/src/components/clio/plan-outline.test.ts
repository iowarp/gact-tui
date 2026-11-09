import { describe, expect, it } from 'vitest';
import { planOutline } from './plan-outline';

describe('planOutline', () => {
  it('counts the steps and risks the plan actually lists', () => {
    expect(
      planOutline(
        '# Regrid\n\n## Steps\n\n1. One\n2. Two\n   - nested\n\n## Execution recommendation\n\nInteractive.\n\n## Risks\n\n- Edge\n- Flags\n\n```\n1. not a step\n```',
      ),
    ).toBe('2 steps, execution recommendation, 2 risks');
  });

  it('falls back to numbered items and the payload guidance', () => {
    expect(
      planOutline('# Plan\n\n1. Wire the mode.', {
        recommended_mode: 'interactive',
        risk_notes: 'Mode must change first.',
      }),
    ).toBe('1 step, execution recommendation, risk notes');
    expect(planOutline('Just prose.')).toBe('');
    expect(planOutline(undefined, { recommended_mode: 'auto' })).toBe('Execution recommendation');
  });
});
