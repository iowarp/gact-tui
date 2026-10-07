export const EVIDENCE_LAYOUTS = ['none', 'bottom', 'top', 'both'] as const;
export type EvidenceLayout = (typeof EVIDENCE_LAYOUTS)[number];

/** The same four-state ring supports pointer and keyboard navigation. */
export function cycleEvidenceLayout(layout: EvidenceLayout, direction: 1 | -1): EvidenceLayout {
  return EVIDENCE_LAYOUTS[
    (EVIDENCE_LAYOUTS.indexOf(layout) + direction + EVIDENCE_LAYOUTS.length) %
      EVIDENCE_LAYOUTS.length
  ]!;
}
