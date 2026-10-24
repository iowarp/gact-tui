import { CATEGORY_TOKENS } from '@/theme/contract';
import { readThemeColor } from '@/theme/runtime';

/** Automatic category identity is shared by charts and maps, independent of row order or filters. */
export function categoryPalette(): string[] {
  return CATEGORY_TOKENS.map(readThemeColor);
}

/** A deterministic colour for the displayed category, including categories arriving later. */
export function categoryColor(value: string | number | boolean): string {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return readThemeColor(CATEGORY_TOKENS[(hash >>> 0) % CATEGORY_TOKENS.length]!);
}
