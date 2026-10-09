import type { DocumentProfile } from '@clio/core/v3';

export type DocumentSourceProfile = 'markdown' | 'html-static' | 'latex';

/** Only readable source formats expose a raw document view. */
export function isDocumentSourceProfile(
  profile: DocumentProfile,
): profile is DocumentSourceProfile {
  return ['markdown', 'html-static', 'latex'].includes(profile);
}

/** Browser office editors belong only to document, spreadsheet, and slide formats. */
export function hasEmbeddedDocumentEditors(profile: DocumentProfile): boolean {
  return profile.startsWith('ooxml-') || profile.startsWith('odf-');
}
