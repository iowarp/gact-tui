import { expect, it } from 'vitest';
import {
  cycleEvidenceLayout,
  evidenceLayout,
  evidenceLayoutSections,
  type EvidenceLayout,
} from './evidence-layout';

it('preserves original and separate-launcher preferences on the same four-state ring', () => {
  expect(evidenceLayout(['session'])).toBe('top');
  expect(evidenceLayout(['work'])).toBe('bottom');
  expect(evidenceLayout(['open'])).toBe('both');
  expect(evidenceLayout(['top', 'work'])).toBe('both');
  let layout: EvidenceLayout = 'none';
  const ring = [];
  for (let index = 0; index < 4; index++) {
    layout = cycleEvidenceLayout(layout, 1);
    ring.push(layout);
    expect(evidenceLayout(evidenceLayoutSections(layout))).toBe(layout);
    expect(cycleEvidenceLayout(layout, -1)).toBe(index === 0 ? 'none' : ring[index - 1]);
  }
  expect(ring).toEqual(['bottom', 'top', 'both', 'none']);
});
