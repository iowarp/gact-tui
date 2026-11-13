import { describe, expect, it } from 'vitest';

import { clearOfCard } from './tour-spotlight';

const GAP = 12;
const stage = { top: 100, left: 0, width: 390, height: 600 };
const card = (top: number) => ({ top, left: 12, width: 366 });

describe('clearOfCard', () => {
  it('lights the larger part the card leaves clear when the card sits mid-spotlight', () => {
    // 100 px above the card, 276 px below it.
    expect(clearOfCard(stage, card(212), 200, GAP)).toEqual({ ...stage, top: 424, height: 276 });
    // 300 px above the card, 76 px below it.
    expect(clearOfCard(stage, card(412), 200, GAP)).toEqual({ ...stage, height: 300 });
  });

  it('never lights the area under the card, however thin the clear strip', () => {
    expect(clearOfCard(stage, card(100), 570, GAP)).toEqual({ ...stage, top: 682, height: 18 });
  });

  it('leaves a spotlight the card does not touch as it is', () => {
    expect(clearOfCard(stage, card(720), 120, GAP)).toBe(stage);
  });
});
