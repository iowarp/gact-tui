export const EVIDENCE_LAYOUTS = ['none', 'bottom', 'top', 'both'] as const;
export type EvidenceLayout = (typeof EVIDENCE_LAYOUTS)[number];

/** Preserve the original four-state ring in both pointer and keyboard directions. */
export function cycleEvidenceLayout(layout: EvidenceLayout, direction: 1 | -1): EvidenceLayout {
  return EVIDENCE_LAYOUTS[
    (EVIDENCE_LAYOUTS.indexOf(layout) + direction + EVIDENCE_LAYOUTS.length) %
      EVIDENCE_LAYOUTS.length
  ]!;
}

/** Read both original top/bottom choices and the later separate-rail preferences. */
export function evidenceLayout(values: readonly string[]): EvidenceLayout {
  const top = values.some((value) => ['top', 'session', 'open'].includes(value));
  const bottom = values.some((value) => ['bottom', 'work', 'open'].includes(value));
  return top ? (bottom ? 'both' : 'top') : bottom ? 'bottom' : 'none';
}

/** Persist one canonical selection, clearing migrated launcher aliases. */
export function evidenceLayoutSections(layout: EvidenceLayout): string[] {
  return layout === 'both' ? ['top', 'bottom'] : layout === 'none' ? [] : [layout];
}
