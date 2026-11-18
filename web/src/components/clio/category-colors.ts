import { CATEGORY_TOKENS } from '@/theme/contract';
import { readThemeColor } from '@/theme/runtime';

/** Automatic category identity is shared by charts and maps, independent of row order or filters. */
export function categoryPalette(): string[] {
  return CATEGORY_TOKENS.map(readThemeColor);
}

function hashSlot(key: string, size: number): number {
  let hash = 2166136261;
  for (const character of key) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return (hash >>> 0) % size;
}

/**
 * The palette slot each category holds on this page, most recently used last.
 *
 * A hash alone gives two of five stations the same colour about half the time (a
 * forecast verification drew Frankfurt and Paris, and Madrid and Rome, alike). Every
 * view asks this one table, so a category keeps its colour across charts, maps and
 * later views; a new category starts at its hash slot and takes the next free one.
 * When every slot is held, the category unused the longest gives its slot up.
 */
const held = new Map<string, number>();

function categorySlot(value: string | number | boolean): number {
  const key = String(value);
  const size = CATEGORY_TOKENS.length;
  const slot = held.get(key);
  if (slot !== undefined) {
    held.delete(key);
    held.set(key, slot);
    return slot;
  }
  const taken = new Set(held.values());
  const start = hashSlot(key, size);
  for (let offset = 0; offset < size; offset += 1) {
    const candidate = (start + offset) % size;
    if (!taken.has(candidate)) {
      held.set(key, candidate);
      return candidate;
    }
  }
  const [oldest, freed] = held.entries().next().value as [string, number];
  held.delete(oldest);
  held.set(key, freed);
  return freed;
}

/** The palette token the displayed category holds on this page. */
export function categoryToken(value: string | number | boolean): (typeof CATEGORY_TOKENS)[number] {
  return CATEGORY_TOKENS[categorySlot(value)]!;
}

/** A colour for the displayed category, the same in every view that shows it. */
export function categoryColor(value: string | number | boolean): string {
  return readThemeColor(categoryToken(value));
}

/** Forget every held slot (tests). */
export function resetCategoryColors(): void {
  held.clear();
}
