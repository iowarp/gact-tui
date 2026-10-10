/** Automatic category identity is shared by charts and maps, independent of row order or filters. */
export const CATEGORY_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#64748b',
  '#0891b2',
  '#65a30d',
  '#be123c',
  '#4f46e5',
  '#db2777',
  '#0f766e',
  '#ca8a04',
  '#a21caf',
] as const;

/** A deterministic colour for the displayed category, including categories arriving later. */
export function categoryColor(value: string | number | boolean): string {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return CATEGORY_COLORS[(hash >>> 0) % CATEGORY_COLORS.length]!;
}
