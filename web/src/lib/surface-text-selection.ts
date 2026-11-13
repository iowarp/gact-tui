import type { DataZoneReference } from '@/components/clio/data-zone-reference';
import { t } from '@lingui/core/macro';

/** Read only a selection wholly inside this rendered surface, including SVG text. */
export function surfaceTextSelection(
  root: Element | null,
  selection = window.getSelection(),
): string {
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return '';
  return range.toString().trim();
}

/** Keep the original view/artifact context and explicitly narrow the reference to selected text. */
export function referenceSelectedText(
  reference: DataZoneReference,
  text: string,
): DataZoneReference {
  if (!text) return reference;
  return {
    ...reference,
    summary: t`Selected text: ${text}`,
    // i18n-ignore: quoted into the message for the agent, kept in English
    markdown: `${reference.markdown}\n\nSelected text (from this view):\n${text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`,
    query: { view: reference.query, text_selection: { text } },
  };
}
