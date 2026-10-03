export interface SentDataReference {
  title: string;
  summary: string;
  markdown: string;
}

/** Project generated leading reference quotes without changing the sent text. */
export function sentDataReferences(text: string): { references: SentDataReference[]; text: string } {
  const references: SentDataReference[] = [];
  let remaining = text;
  while (remaining.startsWith('> ')) {
    const match = /^(?:>[^\n]*(?:\n|$))+/u.exec(remaining);
    if (!match) break;
    const markdown = match[0].trimEnd().split('\n').map((line) => line.replace(/^> ?/u, '')).join('\n');
    let title = /^\*\*(.+)\*\*\nDataset: .+\./u.exec(markdown)?.[1];
    let summary = /^Zone: (.+)$/mu.exec(markdown)?.[1];
    const json = /\n```json\n([\s\S]+)\n```$/u.exec(markdown)?.[1];
    if (!json) break;
    try {
      const query: unknown = JSON.parse(json);
      if (!query || typeof query !== 'object' || Array.isArray(query)) break;
      const captureTitle = /^Region capture of (.+)\. The attached image has labelled boxes\./u.exec(markdown)?.[1];
      if (captureTitle && 'regions' in query && Array.isArray(query.regions) && query.regions.length) {
        const regions = query.regions as unknown[];
        if (!regions.every((region) => region && typeof region === 'object' && 'label' in region && typeof region.label === 'string' && 'box' in region)) break;
        title = captureTitle;
        summary = `${regions.length} labelled ${regions.length === 1 ? 'region' : 'regions'}.`;
      }
    } catch {
      break;
    }
    if (!title || !summary) break;
    references.push({ title, summary, markdown });
    remaining = remaining.slice(match[0].length).replace(/^\n+/u, '');
  }
  return { references, text: remaining };
}
