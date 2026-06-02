/**
 * W3 Tier-2 — command palette frecency.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFrecency,
  commandScore,
  rankByFrecency,
  recordCommandUse,
} from '../../src/frecency.js';

describe('palette frecency', () => {
  beforeEach(() => clearFrecency());

  it('never-used commands keep their original order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { ranked, recentIds } = rankByFrecency(items, (i) => i.id);
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(recentIds.size).toBe(0);
  });

  it('used commands rank above never-used ones', () => {
    recordCommandUse('c');
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { ranked, recentIds } = rankByFrecency(items, (i) => i.id);
    expect(ranked.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(recentIds.has('c')).toBe(true);
  });

  it('more uses outrank fewer uses (same recency bucket)', () => {
    recordCommandUse('a');
    recordCommandUse('b');
    recordCommandUse('b');
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { ranked } = rankByFrecency(items, (i) => i.id);
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('scores accumulate and persist in localStorage', () => {
    expect(commandScore('doctor')).toBe(0);
    recordCommandUse('doctor');
    recordCommandUse('doctor');
    // Used today → count 2 × today-weight 4 = 8.
    expect(commandScore('doctor')).toBe(8);
    const raw = JSON.parse(
      localStorage.getItem('clio.palette-frecency.v1') ?? '{}',
    );
    expect(raw.doctor.count).toBe(2);
  });

  it('marks at most markTop items as recent', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) recordCommandUse(id);
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const { recentIds } = rankByFrecency(items, (i) => i.id, 3);
    expect(recentIds.size).toBe(3);
  });
});
