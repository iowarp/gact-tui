import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORY_TOKENS } from '@/theme/contract';
import { categoryToken as categoryColor, resetCategoryColors } from './category-colors';

describe('categoryColor', () => {
  beforeEach(() => resetCategoryColors());

  it('gives five stations whose hashes collide five different colours', () => {
    const stations = ['Frankfurt', 'Heathrow', 'Madrid', 'Paris CDG', 'Rome'];
    const colors = stations.map(categoryColor);
    expect(new Set(colors).size).toBe(stations.length);
  });

  it('keeps a category colour when another view shows a subset or another order', () => {
    const full = ['Frankfurt', 'Heathrow', 'Madrid', 'Paris CDG', 'Rome'];
    const first = new Map(full.map((name) => [name, categoryColor(name)]));
    for (const name of ['Rome', 'Paris CDG']) expect(categoryColor(name)).toBe(first.get(name));
    for (const name of [...full].reverse()) expect(categoryColor(name)).toBe(first.get(name));
  });

  it('keeps distinct colours up to the palette size, then reuses the least recently used', () => {
    const names = CATEGORY_TOKENS.map((_, index) => `site ${index}`);
    const colors = names.map(categoryColor);
    expect(new Set(colors).size).toBe(names.length);
    categoryColor('site 0');
    const extra = categoryColor('one more');
    expect(extra).toBe(colors[1]);
    expect(categoryColor('site 0')).toBe(colors[0]);
  });
});
